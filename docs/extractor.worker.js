self.onmessage = async (e) => {
    const name = e.data.name
    if (name == 'start') {
        const result = await ifcsgExtractor(e.data.file, e.data.mapping)
        self.postMessage({
            complete: true,
            result: result
        })
    }
}

async function ifcsgExtractor(file, mapping) {
    const t0 = performance.now()
    console.log('Starting worker');

    const entities = []
    for (const [entity, _] of Object.entries(mapping)) {
        entities.push(entity)
    }

    let entityCount = 0
    let relDefCount = 0
    let psetCount = 0
    let valueCount = 0

    const entitiesRegex = entities.toString().toUpperCase().replace(/,/g, '|')

    const regexEnt = new RegExp(`=[\\s]?(${entitiesRegex})\\(`)
    //scehema = #(id)=(entity),(guid),geometry,name,description,(objecttype),placement,shape,(tag),(userdefined)
    const regexEntityCatpture = `(.*)=[\\s]?(${entitiesRegex})\\([^;](.*?)'[^;]+?,(\w+|'.*?'|[$]),(\w+|'.*?'|[$]),(\w+|'.*?'|[$]),(?:.+?),(?:.+?),(\w+|'.*?'|[$])(?:,(.*?))?[\\)|,]`

    const regexRel = new RegExp(/=[\s]?IFCRELDEFINESBYPROPERTIES/)
    const regexRelCapture = new RegExp(/IFCRELDEFINESBYPROPERTIES[^;]*\((.*)\),(.*)\)/)

    const regexPset = new RegExp(/=[\s]?(IFCPROPERTYSET|IFCELEMENTQUANTITY)/)
    const regexPsetIgnore = new RegExp(/ArchiCADProperties|ArchiCADQuantities|AC_Pset|AC_Equantity|ARCHICAD|Component Properties/)
    const regexPsetCapture = new RegExp(/(.*)\=[\s]?(?:IFCPROPERTYSET|IFCELEMENTQUANTITY)[^;]*?,'(.*?)'[^;]*\((.*?)\)/)

    const regexValue = new RegExp(/=[\s]?IFCPROPERTYSINGLEVALUE|IFCPROPERTYENUMERATEDVALUE/)
    const regexValueCapture = new RegExp(/(.*)\=[\s]?(?:IFCPROPERTYSINGLEVALUE|IFCPROPERTYENUMERATEDVALUE)\('(.*?)'[^;]\$,(.*?)\((.*)\),/)
    const regexValueNumeric = new RegExp(/(.*)\=[\s]?(?:IFCQUANTITYVOLUME|IFCQUANTITYLENGTH|IFCQUANTITYAREA|IFCQUANTITYWEIGHT)\('(.+?)',[^;]+?,[^;]+?,(\w+|.*?|[$]),/)

    const relMap = new Map();
    const entityMap = new Map()
    const psetMap = new Map()
    const valueMap = new Map()
    const lineMap = new Map()
    const ifcResult = []

    async function firstPass() {
        // let totalLines = 0
        await readFile(file, line => {
            processline(line);
            // totalLines++;
        });

        function processline(line) {
            if (regexEnt.test(line)) {
                const match = line.match(regexEntityCatpture) || []
                if (match.length) {
                    //scehema = #(id)=(entity),(guid),geometry,(name),(description),(objecttype),placement,shape,(tag),(userdefined)
                    entityMap.set(match[1], {
                        Entity: match[2],
                        Guid: match[3],
                        Name: match[4].replace(/\'/g, ""),
                        Description: match[5] == '$' ? null : match[5].replace(/\'/g, ""),
                        ObjectType: match[6] == '$' ? null : match[6].replace(/\'/g, ""),
                        Tag: match[7] == '$' ? null : match[7].replace(/\'/g, ""),
                        PredefinedType: match[8] ? match[8].replace(/\./g, "") : null
                    })
                } else {
                    const exceptionString = `IFCBUILDINGSYSTEM`
                    //scehema = #(id)=(entity),(guid),geometry,(name),(description),(objecttype),??,??
                    const exceptionCapture = `(.*)=[\\s]?(${exceptionString})\\([^;](.*?)'[^;]+?,(\w+|'.*?'|[$]),(\w+|'.*?'|[$]),(\w+|'.*?'|[$]),`
                    const match = line.match(exceptionCapture) || []
                    if (match.length) {
                        entityMap.set(match[1], {
                            Entity: match[2],
                            Guid: match[3],
                            Name: match[4].replace(/\'/g, ""),
                            Description: match[5].replace(/\'/g, ""),
                            ObjectType: match[6].replace(/\'/g, ""),
                        })
                    }
                }
                entityCount++
                return;
            }

            if (regexRel.test(line)) {
                const match = line.match(regexRelCapture) || []
                if (match.length) {

                    if (relMap.has(match[1])) {
                        relMap.get(match[1]).push(match[2]);
                    } else {
                        relMap.set(match[1], [match[2]]);
                    }
                }
                relDefCount++
                return;
            }

            if (regexPset.test(line) && !regexPsetIgnore.test(line)) {
                const match = line.match(regexPsetCapture) || []
                if (match.length) {
                    psetMap.set(match[1], {
                        pset: match[2],
                        array: match[3].split(',')
                    })

                    match[3].split(',').map(x => {
                        lineMap.set(x, true)
                    })
                }
                psetCount++
                return;
            }
        }
        // console.log(totalLines);
    }


    async function secondPass() {
        await readFile(file, line => {
            processline(line);
        });

        function processline(line) {
            //get id
            let thisLine = false
            const id = line.match(/(.*)=/) || []

            if (lineMap.has(id[1])) {
                valueCount++
                //match according to datatype
                if (regexValue.test(line)) {
                    if (id[1] == '#5018') {
                        console.log('here2');
                    }
                    const match = line.match(regexValueCapture) || []
                    if (match.length) {
                        const index = match[1]
                        const property = match[2]
                        let dataType = match[3]
                        let rawValue = match[4]
                        let value;

                        if (!dataType) {
                            const propertyFromEnum = rawValue.match(new RegExp(/(\w+)\('([^']+)'\)/))
                            dataType = propertyFromEnum[1]
                            rawValue = propertyFromEnum[2]
                        }

                        const numberDataTypes = ['IFCVOLUMEMEASURE', 'IFCREAL', 'IFCTHERMALTRANSMITTANCEMEASURE', 'IFCINTEGER', 'IFCLENGTHMEASURE', 'IFCCOUNTMEASURE', 'IFCPOSITIVELENGTHMEASURE', 'IFCPLANEANGLEMEASURE', 'IFCNUMERICMEASURE', 'IFCAREAMEASURE', 'IFCQUANTITYLENGTH', 'IFCMASSMEASURE']
                        const stringDataTypes = ['IFCIDENTIFIER', 'IFCLABEL', 'IFCTEXT']

                        if (dataType == 'IFCBOOLEAN') {
                            value = rawValue == '.T.' ? true : false;
                        } else if (dataType == 'IFCLOGICAL') {
                            if (rawValue == '.U.') {
                                value = 'UNKNOWN'
                            } else {
                                value = rawValue == '.T.' ? true : false;
                            }
                        } else if (numberDataTypes.includes(dataType)) {
                            value = parseFloat(rawValue)
                        } else if (stringDataTypes.includes(dataType)) {
                            value = rawValue.slice(1, -1)
                        }

                        valueMap.set(index, {
                            property: property,
                            value: value
                        })
                    }

                    lineMap.delete(id[1]);
                    return;
                }

                //match as numbers
                if (regexValueNumeric.test(line)) {

                    const matchNumeric = line.match(regexValueNumeric) || []
                    if (matchNumeric.length) {
                        const index = matchNumeric[1]
                        const property = matchNumeric[2]
                        const value = matchNumeric[3]
                        valueMap.set(index, {
                            property: property,
                            value: convertScientificToDecimal(value)
                        })
                    }

                    lineMap.delete(id[1]);
                    return;
                }


            }
            if (lineMap.size === 0) {
                return
            }

        }
    }

    await firstPass()
    await secondPass()

    console.log('Entity', entityCount, entityMap.size);
    console.log('RelDef', relDefCount, relMap.size);
    console.log('Pset', psetCount, psetMap.size);
    console.log('Value', valueCount, valueMap.size);


    const t1 = performance.now()
    console.log('map in:', convertToFloat((t1 - t0) / 1000), 's');


    const logs = {
        psets: [],
        pset: [],
        prop: []
    }
    for (const [key, obj] of entityMap) {
        const pascalCaseEntity = entities.filter(x => x.toUpperCase() == obj.Entity)
        obj.Entity = pascalCaseEntity[0]
        const psets = relMap.get(key)

        if (!psets) {
            logs.psets.push(`${key},${obj.Entity}`)
            continue;
        }

        for (const psetID of psets) {
            const pset = psetMap.get(psetID)
            if (!pset) {
                logs.pset.push(`${key}, ${psetID}`)
                continue;
            }

            const pset_result = {}
            for (const propID of pset.array) {
                const map = valueMap.get(propID);
                if (!map || map.value == undefined) {
                    const d = {
                        propid: propID,
                        array: pset.array,
                        psetid: psetID
                    }
                    logs.prop.push(d)
                    continue;
                }

                pset_result[map.property] = map.value
            }
            obj[pset.pset] = pset_result
        }
        ifcResult.push(obj)
    }

    const t2 = performance.now()
    console.log('completed in:', convertToFloat((t2 - t0) / 1000), 's');


    const extractorResult = {}
    for (const item of ifcResult) {
        if (!extractorResult[item.Entity]) {
            extractorResult[item.Entity] = [item]
        } else {
            extractorResult[item.Entity].push(item)
        }
    }

    const result = {
        metadata: {
            name: file.name,
            version: 3.0
        },
        data: extractorResult,
    };

    console.log("logs", logs);
    return result
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
        dp = 2
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

async function readFile(file, processline) {
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
                    processline(line);
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

