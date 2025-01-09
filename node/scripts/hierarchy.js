export const ifcHierarchy = {
    IfcRoot: {
        attributes: ['GlobalId', 'OwnerHistory', 'Name', 'Description'],
    },
    IfcObject: {
        parent: 'IfcRoot',
        attributes: ['ObjectType'],
    },
    IfcProduct: {
        parent: 'IfcObject',
        attributes: ['ObjectPlacement', 'Representation'],
    },
    IfcElement: {
        parent: 'IfcProduct',
        attributes: ['Tag'],
        children: ['IfcBuildingElement', 'IfcFeatureElement', 'IfcElementComponent', 'IfcDistributionElement'],
    },
    IfcSpatialElement: {
        parent: 'IfcProduct',
        attributes: ['LongName'],
    },
    IfcSpatialStructureElement: {
        parent: 'IfcSpatialElement',
        attributes: ['CompositionType'],
    },
    IfcFeatureElement: {
        parent: 'IfcElement',
        children: ['IfcFeatureElementSubtraction', 'IfcFeatureElementAddition'],
    },
    IfcDistributionElement: {
        parent: 'IfcElement',
        children: ['IfcDistributionControlElement', 'IfcDistributionFlowElement'],
    },
    IfcDistributionFlowElement: {
        parent: 'IfcDistributionElement',
        children: [
            'IfcFlowStorageDevice',
            'IfcFlowTreatmentDevice',
            'IfcFlowMovingDevice',
            'IfcFlowTerminal',
            'IfcFlowController',
            'IfcEnergyConversionDevice',
            'IfcFlowFitting',
            'IfcFlowSegment',
        ],
    },
    IfcGroup: {
        parent: 'IfcObject',
    },
    IfcSystem: {
        parent: 'IfcGroup',
        children: ['IfcZone'],
    },
    IfcTypeObject: {
        parent: 'IfcRoot',
        attributes: ['ApplicableOccurrence', 'HasPropertySets'],
    },
    IfcTypeProduct: {
        parent: 'IfcTypeObject',
        attributes: ['RepresentationMaps', 'Tag'],
    },
    IfcFurnishingElement: {
        parent: 'IfcElement',
        children: ['IfcFurnishingElement'],
    },
    IfcElementType: {
        parent: 'IfcTypeProduct',
        attributes: ['ElementType'],
        children: ['IfcBuildingElementType', 'IfcDistributionElementType'],
    },
    IfcSpatialElementType: {
        parent: 'IfcTypeProduct',
        attributes: ['ElementType'],
        children: ['IfcSpatialStructureElementType'],
    },
};
