self.onmessage = async (e) => {
    const name = e.data.name;
    if (name == 'start') {
        const result = await ifcsgExtractor(e.data.file);
        self.postMessage({
            complete: true,
            result: result,
        });
    }
};

async function ifcsgExtractor(file) {
    const t0 = performance.now();
    console.log('Starting worker');

    // const entities = getAllIfcEntities();
    const entities = ifcEntityAttributes.map((x) => x.name);
    const attributesMap = new Map();
    for (const item of ifcEntityAttributes) {
        attributesMap.set(item.name.toUpperCase(), item.attributes);
    }

    let entityCount = 0;
    let relDefCount = 0;
    let psetCount = 0;
    let valueCount = 0;

    const entitiesRegex = entities.toString().toUpperCase().replace(/,/g, '|');

    const regexEnt = new RegExp(`=[\\s]?(${entitiesRegex})\\(`);

    const regexRel = new RegExp(/=[\s]?IFCRELDEFINESBYPROPERTIES/);
    const regexRelCapture = new RegExp(/IFCRELDEFINESBYPROPERTIES[^;]*\((.*)\),(.*)\)/);

    const regexPset = new RegExp(/=[\s]?(IFCPROPERTYSET|IFCELEMENTQUANTITY)/);
    const regexPsetIgnore = new RegExp(
        /ArchiCADProperties|ArchiCADQuantities|AC_Pset|AC_Equantity|ARCHICAD|Component Properties/
    );
    const regexPsetCapture = new RegExp(/(.*)\=[\s]?(?:IFCPROPERTYSET|IFCELEMENTQUANTITY)[^;]*?,'(.*?)'[^;]*\((.*?)\)/);
    const regexValue = new RegExp(/=[\s]?IFCPROPERTYSINGLEVALUE|IFCPROPERTYENUMERATEDVALUE/);
    const regexValueCapture = new RegExp(
        /(.*)\=[\s]?(?:IFCPROPERTYSINGLEVALUE|IFCPROPERTYENUMERATEDVALUE)\('(.*?)'[^;]\$,(.*?)\((.*)\),/
    );
    const regexValueNumeric = new RegExp(
        /(.*)\=[\s]?(?:IFCQUANTITYVOLUME|IFCQUANTITYLENGTH|IFCQUANTITYAREA|IFCQUANTITYWEIGHT)\('(.+?)',[^;]+?,[^;]+?,(\w+|.*?|[$]),/
    );

    const relMap = new Map();
    const entityMap = new Map();
    const psetMap = new Map();
    const valueMap = new Map();
    const lineMap = new Map();
    const ifcResult = [];

    async function firstPass() {
        const reIsElement = new RegExp(`(.*)=[\\s]?(${entitiesRegex})`);

        await readFile(file, (line) => {
            processLine(line);
        });

        function processLine(line) {
            if (regexEnt.test(line)) {
                if (!reIsElement.test(line)) return;
                const re = /(.*?)=(.*?)\(/;
                const match = line.match(re);
                const id = match[1];
                const entity = match[2];
                const attrArray = line.match(/\((.*?)\);/)[1].split(',');
                const attributeKeys = attributesMap.get(entity);
                const attributes = {};
                for (const i in attributeKeys) {
                    const key = attributeKeys[i];
                    let value = attrArray[i];
                    if (value == '$') {
                        value = '';
                    } else if (!isNaN(value)) {
                        value = Number(value);
                    } else {
                        value = attrArray[i].replace(/'(.+?)'$/, '$1').replace(/^\.(.+?)\.$/, '$1');
                    }
                    attributes[key] = value;
                }
                entityMap.set(id, { Entity: entity, ...attributes });

                entityCount++;
            }

            if (regexRel.test(line)) {
                const match = line.match(regexRelCapture) || [];
                if (match.length) {
                    if (relMap.has(match[1])) {
                        relMap.get(match[1]).push(match[2]);
                    } else {
                        relMap.set(match[1], [match[2]]);
                    }
                }
                relDefCount++;
                return;
            }

            if (regexPset.test(line) && !regexPsetIgnore.test(line)) {
                const match = line.match(regexPsetCapture) || [];
                if (match.length) {
                    psetMap.set(match[1], {
                        pset: match[2],
                        array: match[3].split(','),
                    });

                    match[3].split(',').map((x) => {
                        lineMap.set(x, true);
                    });
                }
                psetCount++;
                return;
            }
        }
        // console.log(totalLines);
    }

    async function secondPass() {
        await readFile(file, (line) => {
            processLine(line);
        });

        function processLine(line) {
            //get id
            const id = line.match(/(.*)=/) || [];

            if (lineMap.has(id[1])) {
                valueCount++;
                //match according to datatype
                if (regexValue.test(line)) {
                    const match = line.match(regexValueCapture) || [];
                    if (match.length) {
                        const index = match[1];
                        const property = match[2];
                        let dataType = match[3];
                        let rawValue = match[4];
                        let value;

                        if (!dataType) {
                            const propertyFromEnum = rawValue.match(new RegExp(/(\w+)\('([^']+)'\)/));
                            dataType = propertyFromEnum[1];
                            rawValue = propertyFromEnum[2];
                        }

                        const numberDataTypes = [
                            'IFCVOLUMEMEASURE',
                            'IFCREAL',
                            'IFCTHERMALTRANSMITTANCEMEASURE',
                            'IFCINTEGER',
                            'IFCLENGTHMEASURE',
                            'IFCCOUNTMEASURE',
                            'IFCPOSITIVELENGTHMEASURE',
                            'IFCPLANEANGLEMEASURE',
                            'IFCNUMERICMEASURE',
                            'IFCAREAMEASURE',
                            'IFCQUANTITYLENGTH',
                            'IFCMASSMEASURE',
                        ];
                        const stringDataTypes = ['IFCIDENTIFIER', 'IFCLABEL', 'IFCTEXT'];

                        if (dataType == 'IFCBOOLEAN') {
                            value = rawValue == '.T.' ? true : false;
                        } else if (dataType == 'IFCLOGICAL') {
                            if (rawValue == '.U.') {
                                value = 'UNKNOWN';
                            } else {
                                value = rawValue == '.T.' ? true : false;
                            }
                        } else if (numberDataTypes.includes(dataType)) {
                            value = parseFloat(rawValue);
                        } else if (stringDataTypes.includes(dataType)) {
                            value = rawValue.slice(1, -1);
                        }

                        valueMap.set(index, {
                            property: property,
                            value: value,
                        });
                    }

                    lineMap.delete(id[1]);
                    return;
                }

                //match as numbers
                if (regexValueNumeric.test(line)) {
                    const matchNumeric = line.match(regexValueNumeric) || [];
                    if (matchNumeric.length) {
                        const index = matchNumeric[1];
                        const property = matchNumeric[2];
                        const value = matchNumeric[3];
                        valueMap.set(index, {
                            property: property,
                            value: convertScientificToDecimal(value),
                        });
                    }

                    lineMap.delete(id[1]);
                    return;
                }
            }
            if (lineMap.size === 0) {
                return;
            }
        }
    }

    await firstPass();
    await secondPass();

    console.log('Entity', entityCount, entityMap.size);
    console.log('RelDef', relDefCount, relMap.size);
    console.log('Pset', psetCount, psetMap.size);
    console.log('Value', valueCount, valueMap.size);

    const t1 = performance.now();
    console.log('map in:', convertToFloat((t1 - t0) / 1000), 's');

    const logs = {
        psets: [],
        pset: [],
        prop: [],
    };
    for (const [key, obj] of entityMap) {
        const pascalCaseEntity = entities.filter((x) => x.toUpperCase() == obj.Entity);
        obj.Entity = pascalCaseEntity[0];
        const psets = relMap.get(key);

        if (!psets) {
            logs.psets.push(`${key},${obj.Entity}`);
            continue;
        }

        for (const psetID of psets) {
            const pset = psetMap.get(psetID);
            if (!pset) {
                logs.pset.push(`${key}, ${psetID}`);
                continue;
            }

            const pset_result = {};
            for (const propID of pset.array) {
                const map = valueMap.get(propID);
                if (!map || map.value == undefined) {
                    const d = {
                        propid: propID,
                        array: pset.array,
                        psetid: psetID,
                    };
                    logs.prop.push(d);
                    continue;
                }

                pset_result[map.property] = map.value;
            }
            obj[pset.pset] = pset_result;
        }
        ifcResult.push(obj);
    }

    const t2 = performance.now();
    console.log('completed in:', convertToFloat((t2 - t0) / 1000), 's');

    const extractorResult = {};
    for (const item of ifcResult) {
        if (!extractorResult[item.Entity]) {
            extractorResult[item.Entity] = [item];
        } else {
            extractorResult[item.Entity].push(item);
        }
    }

    const result = {
        metadata: {
            name: file.name,
            version: 3.0,
        },
        data: ifcResult,
    };

    // console.log('logs', JSON.stringify(logs, null, 2));
    console.log(logs);
    return result;
}

/**
 * Converts the input to a float with the specified number of decimal places or an integer, if possible.
 *
 * @param {*} input - The input value to convert to a float or integer.
 * @param {number} [dp=2] - The number of decimal places to include in the output (default is 2).
 * @returns {number|string|*} - The input value as a float with the specified number of decimal places or an integer, if possible. If the input cannot be converted, the function returns the original input value.
 *
 * @example
 * // Returns 12.346
 * convertToFloat("12.3456", 3);
 */
function convertToFloat(input, dp) {
    const floatValue = parseFloat(input);
    const intValue = parseInt(input);
    if (!dp) {
        dp = 2;
    }

    if (isNaN(floatValue) || !Number.isInteger(intValue)) {
        return input;
    } else if (Number.isInteger(floatValue)) {
        return intValue;
    } else {
        return Number(floatValue.toFixed(dp));
    }
}

/**
 * Converts a number in scientific notation to a decimal.
 *
 * @param {string | number} value - The input value to convert.
 * @returns {string | number} The converted value if it was in scientific notation, or the original value if not.
 *
 * @example
 * // returns "123.45"
 * convertScientificToDecimal('1.2345e+2');
 *
 * @example
 * // returns "1.36915"
 * convertScientificToDecimal('1.36915000000007E+00');
 */
function convertScientificToDecimal(value) {
    if (typeof value !== 'string') {
        return value; // return the input if it's not a string
    }

    if (/^([0-9.]+)?([eE][-+]?[0-9]+)$/.test(value)) {
        // if the value is in scientific notation, convert it to a decimal
        return Number.parseFloat(value);
    } else {
        return value; // otherwise return the input unchanged
    }
}

async function readFile(file, processLine) {
    return new Promise((resolve, reject) => {
        const CHUNK_SIZE = 1024 * 1024; // 1MB chunk size
        const decoder = new TextDecoder();
        let offset = 0;
        let line = '';

        const readChunk = () => {
            const reader = new FileReader();
            reader.onload = () => {
                const chunk = new Uint8Array(reader.result);
                const chunkStr = decoder.decode(chunk);
                const lines = chunkStr.split('\n');

                // If there is a partial line at the end of the previous chunk, prepend it to the first line in this chunk
                if (line) {
                    lines[0] = line + lines[0];
                    line = '';
                }

                // If the last line in this chunk is not complete, store it for the next chunk
                if (chunkStr[chunkStr.length - 1] !== '\n') {
                    line = lines.pop();
                }

                // Process each line in this chunk
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    processLine(line);
                }

                offset += CHUNK_SIZE;
                if (offset < file.size) {
                    readChunk();
                } else {
                    resolve();
                }
            };

            reader.onerror = () => {
                reject(reader.error);
            };

            const chunk = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(chunk);
        };

        readChunk();
    });
}

function getAllIfcEntities() {
    return [
        'IfcActuator',
        'IfcAirTerminal',
        'IfcAlarm',
        'IfcAudioVisualAppliance',
        'IfcBeam',
        'IfcBoiler',
        'IfcBuilding',
        'IfcBuildingElementProxy',
        'IfcBuildingStorey',
        'IfcBuildingSystem',
        'IfcBurner',
        'IfcCableCarrierSegment',
        'IfcCableFitting',
        'IfcCableSegment',
        'IfcChiller',
        'IfcChimney',
        'IfcCivilElement',
        'IfcColumn',
        'IfcCommunicationsAppliance',
        'IfcCompressor',
        'IfcCoolingTower',
        'IfcCovering',
        'IfcCurtainWall',
        'IfcDamper',
        'IfcDiscreteAccessory',
        'IfcDistributionChamberElement',
        'IfcDistributionSystem',
        'IfcDoor',
        'IfcDuctFitting',
        'IfcDuctSegment',
        'IfcElectricAppliance',
        'IfcElectricDistributionBoard',
        'IfcElectricFlowStorageDevice',
        'IfcElectricGenerator',
        'IfcElement',
        'IfcEngine',
        'IfcFan',
        'IfcFilter',
        'IfcFireSuppressionTerminal',
        'IfcFlowInstrument',
        'IfcFlowMeter',
        'IfcFooting',
        'IfcFurniture',
        'IfcGeographicElement',
        'IfcGrid',
        'IfcInterceptor',
        'IfcJunctionBox',
        'IfcLightFixture',
        'IfcMember',
        'IfcMotorConnection',
        'IfcOpeningElement',
        'IfcOutlet',
        'IfcPile',
        'IfcPipeFitting',
        'IfcPipeSegment',
        'IfcPlate',
        'IfcPump',
        'IfcRailing',
        'IfcRamp',
        'IfcRampFlight',
        'IfcRoof',
        'IfcSanitaryTerminal',
        'IfcSensor',
        'IfcShadingDevice',
        'IfcSite',
        'IfcSlab',
        'IfcSolarDevice',
        'IfcSpace',
        'IfcStackTerminal',
        'IfcStair',
        'IfcStairFlight',
        'IfcSwitchingDevice',
        'IfcTank',
        'IfcTransformer',
        'IfcTransportElement',
        'IfcUnitaryControlElement',
        'IfcUnitaryEquipment',
        'IfcValve',
        'IfcWall',
        'IfcWasteTerminal',
        'IfcWindow',
    ];
}

const ifcEntityAttributes = [
    {
        name: 'IfcBeam',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcBeamType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcBuilding',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
            'CompositionType',
        ],
    },
    {
        name: 'IfcBuildingElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcBuildingElementProxy',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcBuildingElementProxyType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcBuildingElementType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcBuildingStorey',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
            'CompositionType',
            'Elevation',
        ],
    },
    {
        name: 'IfcBuildingSystem',
        attributes: ['GlobalId', 'OwnerHistory', 'Name', 'Description', 'ObjectType', 'PredefinedType', 'LongName'],
    },
    {
        name: 'IfcChimney',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcChimneyType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcCivilElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcCivilElementType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcColumn',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcColumnType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcCovering',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcCoveringType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcCurtainWall',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcCurtainWallType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcDistributionElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcDistributionElementType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcDistributionSystem',
        attributes: ['GlobalId', 'OwnerHistory', 'Name', 'Description', 'ObjectType', 'LongName', 'PredefinedType'],
    },
    {
        name: 'IfcDoor',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'OverallHeight',
            'OverallWidth',
            'PredefinedType',
            'OperationType',
            'UserDefinedOperationType',
        ],
    },
    {
        name: 'IfcDoorType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
            'OperationType',
            'ParameterTakesPrecedence',
            'UserDefinedOperationType',
        ],
    },
    {
        name: 'IfcElementAssembly',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'AssemblyPlace',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcElementAssemblyType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcElementComponent',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcElementComponentType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcExternalSpatialStructureElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
        ],
    },
    {
        name: 'IfcFeatureElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcFooting',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcFootingType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcFurnishingElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcFurnishingElementType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcGeographicElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcGeographicElementType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcMember',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcMemberType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcPile',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
            'ConstructionType',
        ],
    },
    {
        name: 'IfcPileType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcPlate',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcPlateType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcRailing',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcRailingType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcRamp',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcRampFlight',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcRampFlightType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcRampType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcRoof',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcRoofType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcShadingDevice',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcShadingDeviceType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcSite',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
            'CompositionType',
        ],
    },
    {
        name: 'IfcSlab',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcSlabType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcSpace',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
            'CompositionType',
            'PredefinedType',
            'ElevationWithFlooring',
        ],
    },
    {
        name: 'IfcSpaceType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
            'CompositionType',
            'PredefinedType',
            'LongName',
        ],
    },
    {
        name: 'IfcSpatialStructureElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
            'CompositionType',
        ],
    },
    {
        name: 'IfcSpatialStructureElementType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
        ],
    },
    {
        name: 'IfcSpatialZone',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcSpatialZoneType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'LongName',
            'PredefinedType',
            'LongName',
        ],
    },
    {
        name: 'IfcStair',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcStairFlight',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'NumberOfRisers',
            'NumberOfTreads',
            'RiserHeight',
            'TreadLength',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcStairFlightType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcStairType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcStructuralAnalysisModel',
        attributes: ['GlobalId', 'OwnerHistory', 'Name', 'Description', 'ObjectType'],
    },
    {
        name: 'IfcTransportElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcTransportElementType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcVirtualElement',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
        ],
    },
    {
        name: 'IfcWall',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcWallType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
        ],
    },
    {
        name: 'IfcWindow',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'OverallHeight',
            'OverallWidth',
            'PredefinedType',
            'PartitioningType',
            'UserDefinedPartitioningType',
        ],
    },
    {
        name: 'IfcWindowType',
        attributes: [
            'GlobalId',
            'OwnerHistory',
            'Name',
            'Description',
            'ObjectType',
            'ObjectPlacement',
            'Representation',
            'Tag',
            'PredefinedType',
            'PartitioningType',
            'ParameterTakesPrecedence',
            'UserDefinedPartitioningType',
        ],
    },
    {
        name: 'IfcZone',
        attributes: ['GlobalId', 'OwnerHistory', 'Name', 'Description', 'ObjectType', 'LongName'],
    },
];
