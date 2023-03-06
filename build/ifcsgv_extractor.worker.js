self.onmessage = (e) => {
    const data = e.data.workerData
    const entity_pascal = data.key
    const file = data.content
    const cfg = data.config
    const psetMap = data.psetMap
    const relMap = data.relMap
    const entityMap = data.entityMap

    const valuesMap = new Map()
    const ifc_data = []

    let index = 0
    for (const [key, entity] of entityMap) {
        if (cfg.sampleSize != 1) {
            if (index >= cfg.max && cfg.max != 0) {
                break;
            }

            if (index >= cfg.sampleSize * entityMap.size && cfg.min <= index) {
                break;
            }
        }
        index++

        const entity_data = entity
        entity_data.Entity = entity_pascal
        const psets = relMap.get(key)
        for (const item of psets) {
            const pset = psetMap.get(item)

            if (!pset) {
                continue;
            }

            const array = pset.array
            const psetName = pset.pset

            const pset_data = {}
            for (const propId of array) {
                if (valuesMap.get(propId)) {
                    Object.assign(pset_data, valuesMap.get(propId));
                    continue;
                }

                const data = (() => {

                    const regexString = `${propId}=[^;]*?'(.*)'[^;]\\$,(.*),`
                    const match = file.match(regexString) || []
                    let value = match[2]


                    if (value) {
                        if (value.includes('IFCBOOLEAN')) {
                            value = value.match(/\(.(.*).\)/)[1] || '' == 'T' ? true : false
                        }
                        else if (value.match('IFCIDENTIFIER|IFCLABEL')) {
                            value = value.match(/\(.(.*).\)/)[1] || ''
                        }
                        else if (value.match('IFCCOUNTMEASURE')) {
                            const number = value.match(/\((.*)\)/)[1] || ''
                            value = parseInt(number)
                        }
                        else if (value.match('IFCLENGTHMEASURE|IFCPOSITIVELENGTHMEASURE')) {
                            const number = value.match(/\((.*)\)/)[1] || ''
                            value = parseFloat(number)
                        }
                    }
                    valuesMap.set(propId, { [match[1]]: value })

                    return { [match[1]]: value }
                })()

                Object.assign(pset_data, data)
            }
            entity_data[psetName] = pset_data
        }

        ifc_data.push(entity_data)

        let count = Math.max(parseInt(Math.min(cfg.max, entityMap.size * cfg.sampleSize)), cfg.min)
        self.postMessage({
            name: 'extracting',
            key: entity_pascal,
            count: `${ifc_data.length} / ${cfg.max == 0 ? entityMap.size : count}`
        })
    }


    self.postMessage({
        name: 'extracted',
        key: entity_pascal,
        data: ifc_data,
        stats: {
            checked: ifc_data.length,
            found: entityMap.size
        }
    })

}


