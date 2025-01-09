import fs from 'fs';
import xml2js from 'xml2js';
import { ifcHierarchy } from './hierarchy.js';
const file = fs.readFileSync('./resource/IFC4.xsd.xml', 'utf8');
const xmlParser = new xml2js.Parser();

const schema = await new Promise((resolve, reject) => {
    xmlParser.parseString(file, (err, result) => {
        if (err) reject(err);
        resolve(result['xs:schema']);
    });
});

const typeEnumsMap = new Map();
for (const item of schema['xs:simpleType']) {
    const restriction = item['xs:restriction'];
    if (!restriction) continue;

    const enumeration = restriction[0]['xs:enumeration'];
    if (!enumeration) continue;

    const enumsValue = restriction[0]['xs:enumeration'].map((x) => {
        return x.$.value;
    });

    typeEnumsMap.set(item.$.name, enumsValue);
}

const ElementBase = [
    'IfcBuildingElement',
    'IfcElement',
    'IfcSpatialElement',
    'IfcElementComponent',
    'IfcSpatialStructureElement',
    'IfcSystem',
    'IfcFeatureElementSubtraction',
    'IfcFeatureElementAddition',
    'IfcSpatialStructureElement',
    'IfcFlowTerminal',
    'IfcFlowStorageDevice',
    'IfcFlowSegment',
    'IfcFlowMovingDevice',
    'IfcFlowFitting',
    'IfcFlowController',
    'IfcEnergyConversionDevice',
    'IfcDistributionControlElement',
    'IfcFurnishingElement',
    'IfcDistributionFlowElement',
    'IfcFlowTreatmentDevice',
];

const complexType = [];
for (const item of schema['xs:complexType']) {
    const name = item['$'].name;
    const complexContent = item['xs:complexContent'];
    if (!complexContent) continue;

    if (!isElement(complexContent)) continue;

    const data = expandComplexType(complexContent);
    if (!data) continue;
    complexType.push({ name, ...data });
    function isElement(complexContent) {
        const base = findBase(complexContent[0]);
        if (!base) return false;

        const ifcElementBase = ElementBase.map((x) => 'ifc:' + x);
        if (ifcElementBase.includes(base)) {
            return true;
        }

        function findBase(obj) {
            const extensions = obj['xs:extension'];
            if (!extensions) return false;

            for (const ext of extensions) {
                if (ext.$ && ext.$.base) {
                    return ext.$.base;
                }
            }

            return null;
        }
    }

    function expandComplexType(obj) {
        const extension = [...obj[0]['xs:extension']];
        const attributeData = extension[0]['xs:attribute'];
        if (!attributeData) return false;

        const attribute = extension[0]['xs:attribute'].map((x) => {
            return x['$'];
        });

        const data = {
            base: extension[0]['$'].base,
            attribute: attribute.map((x) => x.name),
        };

        return data;
    }
}

fs.writeFileSync('./node/scripts/complexType.json', JSON.stringify(complexType, null, 2));

const ifcElement = schema['xs:element'].map((item) => item['$']);

const complexTypesName = complexType.map((x) => x.name);
const ivSchema = [];
for (const ele of ifcElement) {
    if (!complexTypesName.includes(ele.name)) continue;

    const data = {
        name: ele.name,
    };

    const substitutionGroup = ele.substitutionGroup.replace('ifc:', '');

    const attributes = getFullAttributes(substitutionGroup);
    if (!attributes.length) {
        console.log('Missing Hierarchy Mapping', ele.name, substitutionGroup, attributes);
    }

    const t = complexType.find((x) => x.name == ele.name);
    if (t.attribute) {
        attributes.push(...t.attribute);
        if (t.attribute.includes('PredefinedType')) {
            const tryName = [ele.name + 'TypeEnum', ele.name + 'Enum'];

            for (const name of tryName) {
                const enums = typeEnumsMap.get(name);
                if (!enums) continue;

                data.enumeration = enums.map((x) => x.toUpperCase());
                break;
            }
        }
    }

    data.attributes = attributes;

    ivSchema.push(data);
}

fs.writeFileSync('./node/scripts/ivSchema.json', JSON.stringify(ivSchema, null, 2));
console.log('done');

function getFullAttributes(entity) {
    const visited = new Set(); // To prevent infinite loops
    const attributes = new Set(); // Use Set to avoid duplicates

    // Helper function to find the entity in the hierarchy
    function findEntityInHierarchy(entity) {
        for (const key in ifcHierarchy) {
            if (key == entity) {
                return key;
            }

            const data = ifcHierarchy[key];
            if (data?.children?.includes(entity)) {
                return key;
            }
        }
        return null; // Return null if the entity is not found
    }

    function collectAttributes(current) {
        if (!current || visited.has(current)) return;
        visited.add(current);

        const data = ifcHierarchy[current];

        // Add attributes of the current entity
        if (data?.attributes) {
            data.attributes.forEach((attr) => attributes.add(attr));
        }

        // Traverse upwards to collect parent attributes
        if (data?.parent) {
            collectAttributes(data.parent);
        }
    }

    // Find the entity's parent in the hierarchy
    let parent = findEntityInHierarchy(entity);

    // If the entity is found as a child, start from its parent
    if (parent) {
        collectAttributes(parent);
    }

    return Array.from(attributes); // Convert Set to Array before returning
}
