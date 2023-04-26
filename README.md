![Logo](static/assets/logo_full.svg)

Web Worker for extracting properties from IFC Model.

[Sandbox Demo Page](https://merhmerh.github.io/ifc-extractor/)

## Features

-   🌐 Written in vanilla Javascript
-   🛒 Zero Dependencies
-   💻 Run Locally in the browser
-   🐋 Capable of handling large file

## Concept

The typical format for an IFC file is STEP, where each line contains a single source of information.

The IFC Extractor extracts data from an IFC file and outputs the results in JSON format, containing every element with its parameters and properties.

The IFC Extractor is used in the [IFC-SG Validator](https://code.builtsearch.com/ifcsg-validator) to validate an IFC model for IFC-SG compliance.

## Process Overview

The IFC Extractor uses a web worker that processes your IFC model. It extracts data from an Industry Foundation Classes (IFC) file. The function takes in two parameters, a file and a mapping.

### Parameters

-   `file`: The IFC file that is to be parsed.
-   `mapping`: An object that contains list of IfcEntity.

Data are extracted from the IFC File, specifically from the `ENTITY`, `PROPERTYSET`, and `VALUE` sections of the file. It then stores this data in maps, which are used to organize the extracted data.

It then loops through the entities in the ENTITY map and appends relevant property sets and property values to each entity. The extracted data is then mapped to each entity, and the result is returned as an object.

Promises are used to wait for all results.

## Processing Time

IFC Extractor is optimized for efficient processing of IFC models and uses a technique that splits the file into chunks, allowing for processing of very large files without loading the entire file into memory.

The processing time is relatively fast, at near-native performance.

## Demo

This demo is built with `Svelte` and `SvelteKit`.

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
