<script>
import file from './BCA_G.2.2_V8.ifc?raw';
import { base } from '$app/paths';

start();
async function start() {
    const blob = new Blob([file], { type: 'text/plain' });

    const worker = new Worker(`${base}/extractor2.worker.js`);
    const result = await new Promise((resolve) => {
        worker.postMessage({
            name: 'start',
            file: blob,
        });
        worker.onmessage = (e) => {
            if (e.data.complete) {
                worker.terminate();
                resolve(e.data.result);
            }
        };
    });

    console.log(result);
    const door = result.data.find((x) => x.Entity == 'IfcSpace');
    console.log(door);
    // console.log(door.PredefinedType);
}
</script>

<h1>hello</h1>

<style lang="scss">
h1 {
    color: red;
}
</style>
