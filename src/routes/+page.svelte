<script>
import { onMount } from 'svelte';
import Modal from './Modal.svelte';
import Icon from '@iconify/svelte';
import { fly } from 'svelte/transition';
import { base } from '$app/paths';

import mapping_data from './ifcsg_mapping.json';

let spin = 0;
let ifcInput,
    file,
    processing,
    ifcResult,
    showModal = false,
    progress = 0,
    progress_status = 'Reading File',
    progress_count = '',
    threads = 6;
let config = {
    sampleSize: 0.25,
    max: 50,
    min: 12,
};

onMount(() => {
    console.log(base);
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
    ifcResult = json;
});

//Core Functions

//on file upload
function ifcUploaded(e) {
    file = e.target.files[0];
    showModal = true;
}

//start processing
async function run() {
    showModal = false;
    processing = true;

    const t0 = performance.now();

    //read uploaded IFC file as text
    const content = await new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.readAsText(file);
        fileReader.onload = () => {
            resolve(fileReader.result);
        };
        fileReader.onerror = () => {
            reject(fileReader.error);
        };
    });

    progress = 10;
    progress_status = 'Reading File';

    //Worker require an array of all IFC entities to be extracted.
    //ifcsg_mapping.json is an object with pset and pname data from IFC-SG Specification,

    //To convert mapping to array using ifcsg_mapping.json:
    //const mapping = Object.keys(mapping_data).map((x) => x.toUpperCase());

    //Therefore, it can also be written like this:
    const mapping = [
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

    //Start worker and get result
    const result = await startWorker({
        config: config,
        mapping: mapping,
        content: content,
        filename: file.name,
    });

    const t1 = performance.now();
    console.log(`Completed In ${((t1 - t0) / 1000).toFixed(2)}ms`);
    //artificially wait out 1s to smooth out transition
    await timeout(1000);
    ifcResult = result;
    processing = false;
    progress = 0;
}

//trigger worker
async function startWorker(data) {
    const optimizer_worker = new Worker('/ifcsgv_optimizer.worker.js');

    //Start optimizer worker
    optimizer_worker.postMessage({
        name: 'optimize',
        workerData: data,
    });

    //get result from optimizer
    const optimizerResult = await new Promise((resolve) => {
        optimizer_worker.onmessage = (e) => {
            if (e.data.name == 'optimize') {
                progress = 20;
                progress_status = 'Optimizing Data Structure';
                optimizer_worker.terminate();
                resolve(e.data);
            }
        };
    });

    //Get IfcEntities as Array
    //[IfcBuildingElementProxy, IfcBeams, ...]
    let tasks = Object.entries(optimizerResult.entitiesMap).map((x) => x[0]);

    //Create key value pair of Capitalized and CamelCase of IfcEntity
    //[IFCBEAM=>IfcBeam, IFCBUILDING => IfcBuilding, ...]
    const nameMapping = new Map();
    data.mapping.forEach((entitiy) => {
        nameMapping.set(entitiy.toUpperCase(), entitiy);
    });

    let n = 0;
    let working = null;
    const availableThreads = threads;
    const extractorResult = [];

    const promises = [];
    //start worker for each thread
    for (let i = 0; i < availableThreads; i++) {
        if (!tasks[0]) {
            continue;
        }

        //trigger extractor worker for each entity
        const runTask = new Promise((resolve) => {
            function startWorker() {
                const entity = tasks[0];
                tasks = tasks.filter((x) => x !== entity.toUpperCase());
                const entityMap = optimizerResult.entitiesMap[entity.toUpperCase()];
                const extractor_worker = new Worker('/ifcsgv_extractor.worker.js');

                extractor_worker.postMessage({
                    name: 'extract',
                    workerData: {
                        content: optimizerResult.content,
                        config: config,
                        entityMap: entityMap,
                        relMap: optimizerResult.relMap,
                        psetMap: optimizerResult.psetMap,
                        key: nameMapping.get(entity),
                    },
                });

                extractor_worker.onmessage = (e) => {
                    //for visualising purposes
                    if (e.data.name == 'extracting' && !working) {
                        working = e.data.key;
                    }

                    //for visualising purposes
                    if (e.data.name == 'extracting' && e.data.key == working) {
                        progress_status = `Extracting ${e.data.key}`;
                        progress_count = e.data.count;
                        return;
                    }

                    //When extractor complete, push result to extractorResult, then terminate worker
                    if (e.data.name == 'extracted') {
                        n++;
                        progress = (n / Object.entries(optimizerResult.entitiesMap).length) * 70 + 25;
                        working = null;
                        const result = { [e.data.key]: e.data.data, stats: e.data.stats };
                        extractorResult.push(result);
                        extractor_worker.terminate();

                        if (tasks.length) {
                            startWorker();
                        } else {
                            resolve('done');
                        }
                    }
                };
            }

            startWorker();
        });

        promises.push(runTask);
    }

    //await for all worker to be completed
    await Promise.all(promises);

    //for visualising purpose
    progress = 100;
    progress_status = `Generating Results`;
    progress_count = '';

    //sort result alphabetically
    //extractorResult contain infomations on number of
    //elements checked and total number of elements found.
    extractorResult.sort((a, b) => (Object.keys(a) > Object.keys(b) ? 1 : -1));

    //convert array into object
    //{"IfcBuildingElementProxy":[element,element,...], "IfcBuildingStorey":[element,...], ...}
    const result = {};
    extractorResult.forEach((item) => {
        const key = Object.keys(item)[0];
        const value = item[key];
        result[key] = value;
    });

    return result;
}

function timeout(ms) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
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

    return json.prettyPrint(obj);
}
</script>

{#if showModal}
    <Modal modalPosition="center" on:close={() => (showModal = false)}>
        <div class="modal">
            <h2>Configuration</h2>
            <div class="grid">
                <div class="config">
                    <label for="sampleSize">Sample Size</label>
                    <input
                        name="sampleSize"
                        on:input={(e) => {
                            config.sampleSize = e.target.value;
                            if (e.target.value == 1) {
                                config.max = 0;
                                config.min = 0;
                            } else {
                                config.max = 50;
                                config.min = 12;
                            }
                        }}
                        value="0.25" />
                    <span>
                        1 = Check all elements <br />
                        0.5 = check 50% of elements in each category
                    </span>
                </div>

                <div class="config">
                    <label class="text-m" for="max">Maximum</label>
                    <input id="max" disabled={config.sampleSize >= 1} bind:value={config.max} />
                    <span
                        >Maximum number of elements to be checked after factoring sample size. Set as 0 to check up to
                        sample size.</span>
                </div>

                <div class="config">
                    <label class="text-m" for="min">Minimum</label>
                    <input id="min" disabled={config.sampleSize >= 1} bind:value={config.min} />
                    <span>Minimum number of elements to be checked, ignoring sample size factor.</span>
                </div>
            </div>
            <div class="buttons">
                <button on:click={run}>Continue</button>
            </div>
        </div>
    </Modal>
{/if}

<header>
    <a href="https://github.com/merhmerh/ifc-extractor">
        <Icon icon="mdi:github" width="32" />
    </a>
</header>

<div class="hero">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="title" on:click={animate}>
        <img style="transform:rotateZ({spin}deg)" src="{base}/assets/ifcsgv-logo.svg" alt="logo" />
        <h1>IFC-Extractor</h1>
    </div>
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

                <div class="progressbar mt-l">
                    <div style="width:{progress}%" class="progress" />
                </div>
                <div class="progress_status">
                    <span>{progress_status}</span>
                    <span>{progress_count}</span>
                </div>
            </div>
        {/if}
    </div>
</div>

<div id="result" class="result">
    <h2>📜 Result</h2>
    <div class="wrapper">
        {#if ifcResult}
            {#key ifcResult}
                <pre transition:fly>{@html prettyJSON(ifcResult)}</pre>
            {/key}
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
    padding-block: 3rem;
    display: grid;
    justify-content: center;
    @media screen and (max-width: $mobile) {
        padding-block: 0rem;
        margin-top: -1.5rem;
    }
    .title {
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
        .progress_status {
            display: flex;
            flex-direction: column;
            text-align: center;
            font-family: 'Roboto Mono', monospace;
            span:last-child {
                color: #606b7a;
                font-size: 0.875rem;
            }
        }
        .progressbar {
            width: 90%;
            height: 40px;
            margin-inline: auto;
            border-radius: 1rem;
            background-color: #191c1f;
            position: relative;
            overflow: hidden;

            .progress {
                height: inherit;
                background-image: linear-gradient(
                    -45deg,
                    $accent 25%,
                    transparent 25%,
                    transparent 50%,
                    $accent 50%,
                    $accent 75%,
                    transparent 75%,
                    transparent
                );
                background-color: #2b72cf;
                background-size: 40px 40px;
                background-repeat: repeat;
                width: 0%;
                transition: ease 1s;
                animation: slide 3s linear infinite;
            }

            @keyframes slide {
                0% {
                    background-position: 0 0;
                }
                100% {
                    background-position: 40px 40px;
                }
            }
        }
    }
}

.result {
    h2 {
        text-align: center;
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
