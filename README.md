![Logo](static/assets/logo_full.svg)

Multi-Threaded Web Worker for extracting properties and parameter from IFC Model.

[Sandbox Demo Page](https://merhmerh.github.io/ifc-extractor/)

## Features

-   🌐 Written in vanilla Javascript
-   🛒 Zero Dependencies
-   💻 Run Locally on the browser
-   🌿 Multi-Threaded
-   ⚒️ Configurable

## Concept

The typical format for IFC file is STEP, where each line contain a single source of info.

IFC Extractor extract data from IFC File and Output result in JSON format, containing every element with its parameters and properties.

Ifc Extractor is used in [IFC-SG Validator](https://code.builtsearch.com/ifcsg-validator) (under development), to validate IFC Model for IFC-SG Compliance.

## Process Overview

IFC Extractor uses 2 web worker file:

1. Optimizer
2. Extractor

Optimzer takes in raw IFC File as text, filter unecessary lines (such as geometry and spatial relationship) and return 3 set of key-value pairs

1. Entities Map
2. Relationship Map
3. PropertySet Map

Once optimizer completed the job, multiple instances of extractor can be trigged. Each instance will use a single processing thread.

Each extractor work on a single entity found in Entities Map, and get each element parameters and properties from Relationship Map and PropertySet Map.

Use promise to wait for all results.

## Configuration

IFC Extractor can be configured to reduce processing time at the cost of not checking every element.

| Configuration | Data Type | Comments                                                                                                               |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Sample Size   | Float     | 1 = check 100%, 0.2 = check 20%                                                                                        |
| Maximum       | Integer   | Maximum number of elements to be<br /> checked after factoring sample size.<br /> Set as 0 to check up to sample size. |
| Minimum       | Integer   | Minimum number of elements to be checked,<br /> ignoring sample size factor.                                           |

For file smaller than 50mb, performance is unliekly to be an issue.

For large file > 100mb, it is common to have over thousands of walls, setting a maximum limit to cap number of elements to be checked will improve performance.

## Demo

This demo is built with SvelteKit.

#### Install dependencies

```
npm install
pnpm i
```

#### Start

```
npm run dev
pnpm dev
```

## Author

-   [Arvin | @merhmerh](https://www.github.com/merhmerh)
