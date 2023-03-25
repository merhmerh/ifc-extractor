<script>
import { onMount, tick } from 'svelte';
import Icon from '@iconify/svelte';
import { base } from '$app/paths';
import defaultResult from './defaultResult.json';
import mapping_data from './ifcsg_mapping.json';

let spin = 0;
let ifcInput,
    file,
    processing,
    ifcResult,
    fileName,
    threads = 6;

onMount(() => {
    animate();
    const json = {
        Note: 'This is a demo result, upload IFC model to see your result!',
        IfcStairFlight: {
            Entity: 'IfcStairFlight',
            Guid: 'abVtP6Iv9t92EzKfdH28O',
            ObjectType: 'Monolithic Run:Monolithic Run_PC',
            ElementId: '4409048',
            Pset_EnvironmentalImpactIndicators: {
                Reference: 'Monolithic Run_PC',
            },
            Pset_StairFlightCommon: {
                NosingLength: 0,
                Reference: 'Monolithic Run_PC',
                NumberOfRiser: 8,
                NumberOfTreads: 8,
                RiserHeight: 174.999999999999,
                TreadLength: 275,
            },
        },
    };
    threads = window.navigator.hardwareConcurrency;
});

//Core Functions

//on file upload
function ifcUploaded(e) {
    file = e.target.files[0];
    console.log(file);
    fileName = file.name;
    console.log(fileName);
    run();
}

//start processing
async function run() {
    processing = true;

    const t0 = performance.now();

    //read uploaded IFC file as text
    const ifc = await new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.readAsText(file);
        fileReader.onload = () => {
            resolve(fileReader.result);
        };
        fileReader.onerror = () => {
            reject(fileReader.error);
        };
    });

    //Worker require an array of all IFC entities to be extracted.
    //ifcsg_mapping.json is an object with pset and pname data from IFC-SG Specification,

    //To convert mapping to array using ifcsg_mapping.json:
    //const mapping = Object.keys(mapping_data).map((x) => x.toUpperCase());

    //Therefore, it can also be written like this:
    const entities = [
        'IfcBeam',
        'IfcBuilding',
        'IfcBuildingElementProxy',
        'IfcBuildingStorey',
        'IfcBuildingSystem',
        'IfcCivilElement',
        'IfcColumn',
        'IfcDamper',
        'IfcDistributionChamberElement',
        'IfcDistributionSystem',
        'IfcDoor',
        'IfcFireSuppressionTerminal',
        'IfcFlowMeter',
        'IfcFooting',
        'IfcGeographicElement',
        'IfcInterceptor',
        'IfcPile',
        'IfcPipeSegment',
        'IfcPump',
        'IfcRailing',
        'IfcRamp',
        'IfcSanitaryTerminal',
        'IfcSensor',
        'IfcSite',
        'IfcSlab',
        'IfcSpace',
        'IfcStair',
        'IfcStairFlight',
        'IfcTank',
        'IfcTransportElement',
        'IfcUnitaryControlElement',
        'IfcWall',
        'IfcWindow',
    ];

    const worker = new Worker(`${base}/ifcsg-extractor.worker.js`);
    const result = await new Promise((resolve) => {
        worker.postMessage({
            name: 'start',
            ifc: ifc,
            entities: entities,
            threads: 16,
        });

        worker.onmessage = (e) => {
            if (e.data.message) {
                console.log(e.data.message);
            }

            if (e.data.name == 'extraction') {
                console.log('extraction complete');
            }

            if (e.data.complete) {
                worker.terminate();
                resolve(e.data.result);
            }
        };
    });

    const t1 = performance.now();
    console.log(`Completed In ${((t1 - t0) / 1000).toFixed(2)}s`);

    console.log(result);
    processing = false;
    await timeout(500);
    ifcResult = result;
    await tick();
    document.querySelector('#result').scrollIntoView({
        behavior: 'smooth',
    });
}

function timeout(ms) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}

function downloadJSON() {
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(ifcResult, null, 2)], { type: 'application/json' }));
    a.download = fileName.split('.')[0] + '.json';
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

//Aesthetic functions
function animate() {
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            spin += 90;
        }, 100);
    }
}

function prettyJSON(obj) {
    const json = {
        replacer: function (match, pIndent, pKey, pVal, pEnd) {
            var key = '<span class=json-key>';
            var val = '<span class=json-value>';
            var str = '<span class=json-string>';
            var r = pIndent || '';
            if (pKey) r = r + key + pKey.replace(/[": ]/g, '') + '</span>: ';
            if (pVal) r = r + (pVal[0] == '"' ? str : val) + pVal + '</span>';
            return r + (pEnd || '');
        },
        prettyPrint: function (obj) {
            var jsonLine = /^( *)("[\w]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/gm;
            return JSON.stringify(obj, null, 2)
                .replace(/&/g, '&amp;')
                .replace(/\\"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(jsonLine, json.replacer);
        },
    };
    const cutoff = 50;
    const html = json.prettyPrint(obj);
    const array = html.split(',');
    let shortHtml = array.slice(0, cutoff).join(',');
    if (array.length >= cutoff) {
        shortHtml += `\n<span class="more">... ${array.length - cutoff} more lines</span>`;
    }
    return shortHtml;
}
</script>

<header>
    <a href="https://github.com/merhmerh/ifc-extractor">
        <Icon icon="mdi:github" width="32" />
    </a>
</header>

<div class="hero">
    <button class="title" on:click={animate}>
        <img style="transform:rotateZ({spin}deg)" src="{base}/assets/ifcsgv-logo.svg" alt="logo" />
        <h1>IFC-Extractor</h1>
    </button>
    <span>Multi-Threaded Web Worker for extracting properties and parameter from IFC Model.</span>
</div>

<div class="demo">
    <h2>🧪 Demo</h2>

    <div class="uploader">
        {#if !processing}
            <button
                class="uploadbox"
                on:click={() => {
                    ifcInput.click();
                    ifcInput.value = null;
                }}>
                <div class="main">
                    <img src="{base}/assets/ifc-logo.svg" alt="upload IFC" />
                    <span>Upload IFC</span>
                </div>
                <input bind:this={ifcInput} on:change={(e) => ifcUploaded(e)} type="file" accept=".ifc" />
            </button>
        {:else}
            <div class="process">
                <h2>Processing...</h2>

                <Icon icon="svg-spinners:blocks-shuffle-3" width="60" />
            </div>
        {/if}
    </div>
</div>
<div id="result" class="result">
    <h2>
        📜 Result
        {#if ifcResult}
            {fileName}
            <button on:click={downloadJSON}>Download JSON</button>
        {/if}
    </h2>
    <div class="wrapper">
        {#if ifcResult}
            {#key ifcResult}
                <pre>{@html prettyJSON(ifcResult)}</pre>
            {/key}
        {:else}
            <pre>{@html prettyJSON(defaultResult)}</pre>
        {/if}
    </div>
</div>

<footer>
    <span>IFC-Extractor, 2023</span>
    <div class="links">
        <a href="https://github.com/merhmerh/ifc-extractor/blob/main/LICENSE">MIT License</a>
        <a href="https://github.com/merhmerh/ifc-extractor">GitHub</a>
        <a href="https://code.builtsearch.com/ifcsg-validator">IFC-SG Validator</a>
    </div>
    <span>An initiative by BIMLife</span>
</footer>

<style global lang="scss">
header {
    display: flex;
    justify-content: flex-end;
    padding-block: 0.5rem;
    a {
        color: #606b7a;
        transition: all 0.3s ease;
        &:hover {
            color: $accent;
            transform: rotateZ(-5deg);
        }
    }
}

.hero {
    padding-block: 0 3rem;
    display: grid;
    justify-content: center;
    @media screen and (max-width: $mobile) {
        padding-block: 0rem;
        margin-top: -1.5rem;
    }
    button.title {
        border: none;
        display: flex;
        justify-content: center;
        padding: 1rem;
        width: fit-content;
        margin-inline: auto;
        align-items: center;
        gap: 1rem;
        img {
            height: 60px;
            cursor: pointer;
            transition: all 2s cubic-bezier(0.32, 0, 0.38, 1);
            @media screen and (max-width: $mobile) {
                height: 48px;
            }
        }
        h1 {
            margin: 0;
            cursor: pointer;
            font-size: 3rem;
            font-weight: 700;
            color: #5883c9;
            @media screen and (max-width: $mobile) {
                font-size: 2rem;
            }
        }
        &:hover {
            background-color: transparent;
        }
    }
    span {
        font-weight: 400;
        width: 500px;
        text-align: center;
        @media screen and (max-width: $mobile) {
            width: 100%;
        }
    }
}

.demo {
    border-radius: 1rem;
    h2 {
        text-align: center;
        margin: 0;
    }
    .uploader {
        margin-top: 1rem;
    }
    .uploadbox {
        background-color: #23272e;
        width: 100%;
        height: 400px;
        border-radius: 1rem;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        border: none;
        cursor: pointer;
        @media screen and (max-width: $mobile) {
            height: 300px;
        }

        &:hover {
            &:after {
                border-color: $accent;
            }
            span {
                color: $accent;
            }
        }

        &:after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            border-radius: 0.5rem;
            transform: translate(-50%, -50%);
            width: calc(100% - 2rem);
            height: calc(100% - 2rem);
            border: 2px dashed #646669;
        }

        .main {
            display: flex;
            justify-content: center;
            flex-direction: column;
            gap: 1rem;
            font-size: 1.5rem;
            font-weight: 500;
            img {
                height: 128px;
            }

            .icon {
                display: flex;
                justify-content: center;
            }
        }
        input {
            display: none;
        }
    }
    .process {
        background-color: #23272e;
        width: 100%;
        height: 400px;
        border-radius: 1rem;
        position: relative;
        border: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-block: 6rem;
        gap: 0.5rem;
        @media screen and (max-width: $mobile) {
            height: 300px;
        }

        h2 {
            font-family: 'Roboto Mono', monospace;
            font-size: 2rem;
            margin-bottom: 1.5rem;
        }
    }
}

.result {
    h2 {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        button {
            margin-left: auto;
            font-size: 1rem;
        }
    }
    .wrapper {
        border-radius: 1rem;
        padding: 1rem;
        padding-left: 2rem;
        background-color: #23272e;
        pre {
            white-space: break-spaces;
            word-break: break-word;
            max-width: 800px;
            max-height: 900px;
            overflow: auto;
            font-family: Roboto Mono, monospace;
            .json-key {
                color: #ff79c6;
            }
            .json-value {
                font-weight: 400;
                color: #bd93f9;
            }
            .json-string {
                color: #f1fa8c;
            }
            .more {
                font-family: Roboto Mono, monospace;
                margin-block: 8px;
                background-color: #414244;
                color: #8f969e;
                padding: 4px 8px;
                display: inline-flex;
                align-items: center;
                border-radius: 0.25rem;
            }
            @media screen and (max-width: $mobile) {
                white-space: pre-wrap;
                font-size: 0.75rem;
                max-width: 100%;
                width: 100%;
            }
        }
    }
}

footer {
    padding-top: 4rem;
    padding-bottom: 1rem;
    color: #606b7a;
    display: flex;
    font-size: 0.875rem;
    justify-content: space-between;
    @media screen and (max-width: $mobile) {
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 0.25rem;
    }
    .links {
        display: flex;
        gap: 1rem;
        a {
            color: #606b7a;
            text-decoration: none;
            font-weight: 600;
            &:hover {
                color: $accent;
            }
        }
    }
}

.modal {
    padding-right: 1rem;
    h2 {
        margin: 0;
    }
    .grid {
        padding-block: 2rem;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2rem;
        align-items: baseline;
        .config {
            display: grid;
            gap: 0.5rem;
            label {
                font-size: 1rem;
            }

            span {
                color: #606b7a;
                font-size: 0.875rem;
            }
            input {
                background-color: #23272e;
                border: none;
                outline: none;
                padding: 0.5rem;
                color: inherit;
                font-size: inherit;
                border: 1px solid rgb(52, 62, 79);
                border-radius: 0.5rem;
                &:focus {
                    border: 1px solid $accent;
                }
            }
        }
    }
    .buttons {
        display: flex;
        justify-content: flex-end;
    }
}
</style>
