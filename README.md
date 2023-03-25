![Logo](static/assets/logo_full.svg)

Multi-Threaded Web Worker for extracting properties and parameter from IFC Model.

[Sandbox Demo Page](https://merhmerh.github.io/ifc-extractor/)

## Features

-   🌐 Written in vanilla Javascript
-   🛒 Zero Dependencies
-   💻 Run Locally on the browser
-   🌿 Multi-Threaded

## Concept

The typical format for an IFC file is STEP, where each line contains a single source of information.

The IFC Extractor extracts data from an IFC file and outputs the results in JSON format, containing every element with its parameters and properties.

The IFC Extractor is used in the [IFC-SG Validator](https://code.builtsearch.com/ifcsg-validator) to validate an IFC model for IFC-SG compliance.

## Process Overview

The IFC Extractor uses a recursive web worker that automatically processes your IFC model. The two main processes are:

1. Optimizer
2. Extractor

The optimizer takes in the raw IFC file as text, filters unnecessary lines (such as geometry and spatial relationships), and returns three sets of key-value pairs:

1. Entities Map
2. Relationship Map
3. PropertySet Map

Once the optimizer has completed its job, multiple instances of the extractor can be triggered. Each instance will use a single processing thread.

Each extractor works on a single entity found in the Entities Map and maps each element's parameters and properties with data from the Relationship and PropertySet Map.

Promises are used to wait for all results.

## Processing Time

The IFC Extractor has been optimized for efficient processing of IFC models, allowing for quick processing times. On a modern CPU, it can process files that are less than 50 MB in less than 5 seconds.

However, the processing time increases exponentially with the size of the IFC Model.

## Demo

This demo is built with Svelte and SvelteKit.

### Install dependencies

Using npm or pnpm

```
npm install
```

```
pnpm install
```

### Start

```
npm run dev
```

```
pnpm dev
```

## Author

-   [Arvin | @merhmerh](https://www.github.com/merhmerh)
