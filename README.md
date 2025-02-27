# Project Status Update

This project is no longer being actively developed, as we have moved on to a new platform: [BuiltSearch IV](https://iv.builtsearch.com). The new platform leverages our next-generation extractor, which provides improved accuracy and performance. However, please note that it is not longer open-source.

### Limitations of the Current Extractor

While the current extractor was an important step in our journey, it does have limitations. There are bugs that hinder its ability to capture all elements accurately, and certain edge cases remain unresolved. As a result, the current extractor may not work as intended in all scenarios, and we recommend exploring alternatives or the next-generation solution on [BuiltSearch IV](https://iv.builtsearch.com) for a more robust experience.

### Archival Notice

This repository will be archived and is no longer open for contributions or updates. Archiving means the repository will be in a read-only state, and no further changes can be made (such as pushing new commits, creating issues, or opening pull requests). The code will remain available for reference, but it will no longer be maintained.

---

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
