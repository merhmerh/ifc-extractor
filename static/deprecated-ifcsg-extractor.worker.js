self.onmessage = async (e) => {
    const name = e.data.name

    if (name == 'start') {
        self.postMessage({
            message: "Starting Web Worker Process",
        })

        const result = await start(e)
        self.postMessage({
            complete: true,
            message: "Maps Extraction Completed",
            result: result
        })
    }

    if (name == 'mapMain') {
        const result = await mapMain(e)
        self.postMessage({
            complete: true,
            message: "Map Data Completed",
            result: result
        })
    }

    if (name == 'optimize') {
        const result = optimize(e.data.ifc, e.data.entities, e.data.id)
        self.postMessage({
            result: result
        })
    }

    if (name == 'mapdata') {
        const result = mapdata(e.data.maps)
        self.postMessage({
            completed: true,
            result: result
        })
    }

}

async function readFile(fileData) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        // define the file to read
        const fileToRead = fileData;
        let lines = [];

        // read the file in chunks
        function readChunk(offset, chunkSize) {
            const file = fileToRead.slice(offset, offset + chunkSize);

            reader.onload = function () {
                const partialLines = reader.result.split('\n');

                partialLines.pop(); //remove last item from array

                // add the partial lines to the array
                lines = [...lines, ...partialLines];

                // read the next chunk if there is one
                if (offset + chunkSize < fileToRead.size) {
                    readChunk(offset + chunkSize - 1, chunkSize);
                } else {
                    resolve(lines);
                }
            };

            reader.onerror = function (error) {
                console.log(error);
            };

            reader.readAsText(file);
        }

        // start reading the file
        readChunk(0, 1024 * 1024 * 50); // read in 1MB chunks
    });
}

async function start(e) {
    const threads = e.data.threads

    //split ifc into threads section
    // const ifcArray = e.data.ifc
    const ifcArray = await readFile(e.data.ifc)

    // const ifcArray = ifc.split('\n')
    const lines = ifcArray.length
    const linesPerWorker = Math.floor(lines / threads)
    let lowerBound = 0
    let upperBound = linesPerWorker

    const promises = []


    for (let i = 0; i < threads; i++) {

        const runWorker = new Promise(resolve => {
            const id = `GROUP-${i}`
            let workingIfc = ifcArray.slice(lowerBound, upperBound)
            if (i + 1 == threads) {
                workingIfc = ifcArray.slice(lowerBound)
            }
            const worker = new Worker('ifcsg-extractor.worker.js')
            // console.log(id, lowerBound, upperBound);

            worker.postMessage({
                name: 'optimize',
                id: id,
                ifc: workingIfc,
                entities: e.data.entities
            })

            worker.onmessage = (e) => {
                worker.terminate()
                resolve(e.data.result)
            }

            lowerBound = upperBound + 1
            upperBound = upperBound + linesPerWorker
        })

        promises.push(runWorker)
    }

    //wait for extraction result
    const rawResult = await Promise.all(promises)

    //merge maps
    const entityMap = new Map(rawResult.map(x => x.entityMap).map(map => [...map]).flat())
    const psetMap = new Map(rawResult.map(x => x.psetMap).map(map => [...map]).flat())
    const valueMap = new Map(rawResult.map(x => x.valueMap).map(map => [...map]).flat())
    const relArray = rawResult.map(x => x.relObj)

    const relMap = new Map();
    for (let i = 0; i < relArray.length; i++) {
        const item = relArray[i];
        const entries = Object.entries(item);

        for (let j = 0; j < entries.length; j++) {
            const [key, value] = entries[j];

            if (relMap.has(key)) {
                relMap.set(key, [...relMap.get(key), ...value]);
            } else {
                relMap.set(key, value);
            }
        }
    }

    const nameMapping = new Map()
    e.data.entities.forEach((entitiy) => {
        nameMapping.set(entitiy.toUpperCase(), entitiy);
    });

    self.postMessage({
        name: `extraction`,
        message: "Data Extracted",
        data: entityMap.size,
    })

    const maps = {
        entityMap, psetMap, valueMap, relMap, nameMapping
    }

    return (maps)
}

function optimize(ifc, entities) {
    const entitiesRegex = entities.toString().toUpperCase().replace(/,/g, '|')

    const regexString = entitiesRegex + `|IFCRELDEFINESBYPROPERTIES|IFCPROPERTYSET|IFCPROPERTYSINGLEVALUE`

    const entityMap = new Map()
    const psetMap = new Map()
    const relObj = {}
    const valueMap = new Map()

    for (let i = 0; i < ifc.length; i++) {
        const line = ifc[i]
        const regex = new RegExp(regexString)
        if (!line.match(regex)) {
            continue;
        }

        const regEnt = `(.*)=[\\s]?(${entitiesRegex})\\([^;](.*?)'[^;]+?'(.+?)',(?:.+?),(?:.+?),(?:.+?),(?:.+?),(.+?),(.+?)[\)|,]`
        const match = line.match(regEnt) || []
        if (match.length) {
            entityMap.set(match[1], {
                Entity: match[2],
                Guid: match[3],
                ObjectType: match[4],
                ElementId: match[5],
                PredefinedType: match[6]
            })
            continue;
        }

        const regRel = `IFCRELDEFINESBYPROPERTIES[^;]*\\((.*)\\),(.*)\\)`
        const matchRel = line.match(regRel) || []
        if (matchRel.length) {
            if (relObj[matchRel[1]]) {
                relObj[matchRel[1]].push(matchRel[2])
            } else {
                relObj[matchRel[1]] = [matchRel[2]]
            }
            continue;
        }

        const regPset = `(.*)\=[\\s]?IFCPROPERTYSET[^;]*?,'(.*?)'[^;]*\\((.*?)\\)`
        const matchPset = line.match(regPset) || []
        if (matchPset.length) {
            psetMap.set(matchPset[1], {
                pset: matchPset[2],
                array: matchPset[3].split(',')
            })
            continue;
        }

        const regValue = `(.*)\=[\\s]?IFCPROPERTYSINGLEVALUE\\('(.*?)'[^;]\\$,(.*?)\\((.*)\\),`
        const matchValue = line.match(regValue) || []
        if (matchValue.length) {
            const index = matchValue[1]
            const property = matchValue[2]
            const dataType = matchValue[3]
            const rawValue = matchValue[4]
            let value;

            const numberDataTypes = ['IFCLENGTHMEASURE', 'IFCCOUNTMEASURE', 'IFCPOSITIVELENGTHMEASURE']
            const stringDataTypes = ['IFCIDENTIFIER', 'IFCLABEL']


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
            continue;
        }
    }

    return {
        entityMap: entityMap,
        relObj: relObj,
        psetMap: psetMap,
        valueMap: valueMap
    }
}

function mapdata(maps) {
    const entityMap = maps.entityMap
    const ifc_data = []

    for (const [key, entity] of entityMap) {

        const pascalCaseEntity = maps.nameMapping.get(entity.Entity)
        const psets = maps.relMap.get(key)

        entity.Entity = pascalCaseEntity
        if (!psets) {
            continue;
        }
        for (const item of psets) {
            const pset = maps.psetMap.get(item)
            if (!pset) {
                continue;
            }

            const array = pset.array
            const psetName = pset.pset
            const pset_data = {}

            for (const propId of array) {
                const map = maps.valueMap.get(propId)
                if (!map) {
                    break;
                }
                pset_data[map.property] = map.value

            }

            entity[psetName] = pset_data
        }
        ifc_data.push(entity)
        // self.postMessage({ name: `mapped`, element: pascalCaseEntity })
    }
    return ifc_data
}

