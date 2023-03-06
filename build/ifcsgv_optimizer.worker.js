self.onmessage = (e) => {
    const name = e.data.name
    const data = e.data.workerData
    if (name == 'optimize') {
        optimize(data.content, data.mapping)
    }
}

function optimize(data, mapping) {
    const entities = Object.keys(mapping).map(x => x.toUpperCase())
    const entitiesRegex = entities.toString().replace(/,/g, '|')

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
        'IFCDERIVEDUNITELEMENT',
        'IFCCONNECTIONSURFACEGEOMETRY',
        'IFCSURFACEOFLINEAREXTRUSION',
        'IFCPLANE',
        'IFCPOLYLINE',
        'IFCRELASSOCIATESMATERIAL',
        'IFCRELSPACEBOUNDARY',
        'IFCCOLOURRGB',
    ]

    const map = new Map()
    const psetMap = new Map()
    const relObj = {}
    const lines = data.split('\n')
    let text = ''

    lines.forEach(line => {
        const regexString = regex_array.toString().replace(/,/g, '|')
        const regex = new RegExp(regexString)
        if (!line.match(regex)) {
            text += line + '\n'


            const regEnt = `(.*)=\\s(${entitiesRegex})\\([^;].(.*?)'[^;]*\\$,'(.*?)'[^;]*,'(.*)'`
            const match = line.match(regEnt) || []
            if (match.length) {
                map.set(match[1], {
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

            const regPset = `(.*)\=\\sIFCPROPERTYSET[^;]*?,'(.*?)'[^;]*\\((.*?)\\)`
            const matchPset = line.match(regPset) || []
            if (matchPset.length) {
                psetMap.set(matchPset[1], {
                    pset: matchPset[2],
                    array: matchPset[3].split(',')
                })
            }
        }
    });

    const obj = {}
    for (const [key, value] of map) {

        if (!obj[value.Entity]) {
            obj[value.Entity] = new Map()
        }
        obj[value.Entity].set(key, value)


    }

    const relMap = new Map(Object.entries(relObj))
    self.postMessage({
        name: 'optimize',
        content: text,
        entitiesMap: obj,
        relMap: relMap,
        psetMap: psetMap,
    })
}