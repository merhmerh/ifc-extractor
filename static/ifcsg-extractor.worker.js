self.onmessage = async (e) => {
    const name = e.data.name

    if (name == 'start') {
        self.postMessage({
            message: "Starting Ifc Extractor",
        })

        const result = await start(e)
        self.postMessage({
            complete: true,
            message: "Ifc Extraction Completed",
            result: result
        })
    }

    if (name == 'optimize') {
        const result = optimize(e.data.ifc, e.data.entities)
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

async function start(e) {
    const threads = e.data.threads

    //split ifc into threads section
    const ifc = e.data.ifc

    const ifcArray = ifc.split('\n')
    const lines = ifcArray.length
    const linesPerWorker = Math.floor(lines / threads)
    let lowerBound = 0
    let upperBound = linesPerWorker
    const promises = []
    for (let i = 0; i < threads; i++) {

        const runWorker = new Promise(resolve => {
            let workingIfc = ifcArray.slice(lowerBound, upperBound)
            if (i + 1 == threads) {
                workingIfc = ifcArray.slice(lowerBound)
            }
            const worker = new Worker('ifcsg-extractor.worker.js')

            worker.postMessage({
                name: 'optimize',
                ifc: workingIfc,
                entities: e.data.entities
            })

            worker.onmessage = (e) => {

                worker.terminate()
                resolve(e.data.result)
            }

            lowerBound = upperBound
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
    const relObj = {}
    relArray.forEach(item => {
        for (let i = 0; i < Object.entries(item).length; i++) {
            const obj = Object.entries(item)[i]
            if (relObj[obj[0]]) {
                relObj[obj[0]] = [...relObj[obj[0]], ...obj[1]]
            } else {
                relObj[obj[0]] = obj[1]
            }
        }
    })
    const relMap = new Map(Object.entries(relObj))


    self.postMessage({
        name: `extraction`,
        message: "Maps Extraction Completed",
        data: entityMap.size
    })

    //split entities into threads
    const mappingPromise = []
    const entitesPerWorker = parseInt(entityMap.size / threads)
    lowerBound = 0
    upperBound = entitesPerWorker

    const nameMapping = new Map()
    e.data.entities.forEach((entitiy) => {
        nameMapping.set(entitiy.toUpperCase(), entitiy);
    });

    for (let i = 0; i < threads; i++) {
        const runWorker = new Promise(resolve => {
            //split entites map in number threads
            let array = Array.from(entityMap).slice(lowerBound, upperBound)
            if (i + 1 == threads) {
                array = Array.from(entityMap).slice(lowerBound)
            }
            const splitEntityMap = new Map(array)

            const worker = new Worker('ifcsg-extractor.worker.js')

            worker.postMessage({
                name: 'mapdata',
                maps: {
                    entityMap: splitEntityMap,
                    relMap,
                    psetMap,
                    valueMap,
                    nameMapping
                },
            })

            worker.onmessage = (e) => {

                self.postMessage({
                    name: e.data.name,
                    element: e.data.element
                })
                if (e.data.completed) {
                    resolve(e.data.result)
                    worker.terminate()
                }
            }

            lowerBound = upperBound
            upperBound = upperBound + entitesPerWorker
        })

        mappingPromise.push(runWorker)
    }

    const rawResult_IfcData = await Promise.all(mappingPromise)
    const result = {}
    const resultArray = rawResult_IfcData.flat()
    for (const item of resultArray) {

        if (!result[item.Entity]) {
            result[item.Entity] = [item]
        } else {
            result[item.Entity].push(item)
        }
    }
    return result
}

function optimize(ifc, entities) {
    const entitiesRegex = entities.toString().toUpperCase().replace(/,/g, '|')

    const regex_array = [
        'IFCRELFILLSELEMENT',
        'IFCRELVOIDSELEMENT',
        'IFCREPRESENTATIONMAP',
        'IFCTRIANGULATEDFACESET',
        'IFCCURVEBOUNDEDPLANE',
        'IFCINDEXEDPOLYGONALFACE',
        'IFCPRESENTATIONLAYERASSIGNMENT',
        'IFCCARTESIANPOINT',
        'IFCCOLOURRGBLIST',
        'IFCPOLYGONALFACESET',
        'IFCAXIS2PLACEMENT3D',
        'IFCARBITRARY',
        'IFCSTYLEDITEM',
        'IFCEXTRUDED',
        'IFCINDEXED',
        'IFCMATERIAL',
        'IFCLOCALPLACEMENT',
        'IFCSHAPE',
        'IFCDIRECTION',
        'IFCPRODUCTDEFINITIONSHAPE',
        'IFCQUANTITY',
        'IFCSIUNIT',
        'IFCDERIVEDUNIT',
        'IFCCONNECTIONSURFACEGEOMETRY',
        'IFCGEOMETRICREPRESENTATIONSUBCONTEXT',
        'IFCSURFACEOFLINEAREXTRUSION',
        'IFCPLANE',
        'IFCPOLYLINE',
        'IFCRELASSOCIATESMATERIAL',
        'IFCRELSPACEBOUNDARY',
        'IFCCOLOURRGB',
    ]
    const regexString = regex_array.toString().replace(/,/g, '|')

    const entityMap = new Map()
    const psetMap = new Map()
    const relObj = {}
    const valueMap = new Map()

    ifc.forEach(line => {
        const regex = new RegExp(regexString)
        if (!line.match(regex)) {

            const regEnt = `(.*)=[\\s]?(${entitiesRegex})\\([^;].(.*?)'[^;]*\\$,'(.*?)'[^;]*,'(.*)'`
            const match = line.match(regEnt) || []
            if (match.length) {
                entityMap.set(match[1], {
                    Entity: match[2],
                    Guid: match[3],
                    ObjectType: match[4],
                    ElementId: match[5]
                })
            }

            const regRel = `IFCRELDEFINESBYPROPERTIES[^;]*\\((.*)\\),(.*)\\)`
            const matchRel = line.match(regRel) || []
            if (matchRel.length) {
                if (relObj[matchRel[1]]) {
                    relObj[matchRel[1]].push(matchRel[2])
                } else {
                    relObj[matchRel[1]] = [matchRel[2]]
                }
            }

            const regPset = `(.*)\=[\\s]?IFCPROPERTYSET[^;]*?,'(.*?)'[^;]*\\((.*?)\\)`
            const matchPset = line.match(regPset) || []
            if (matchPset.length) {
                psetMap.set(matchPset[1], {
                    pset: matchPset[2],
                    array: matchPset[3].split(',')
                })
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

            }

        }
    });

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
        self.postMessage({ name: `mapped`, element: pascalCaseEntity })
    }
    return ifc_data
}