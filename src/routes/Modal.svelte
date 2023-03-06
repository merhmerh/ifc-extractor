<script>
import { createEventDispatcher, onDestroy } from 'svelte';
import { scale, fade } from 'svelte/transition';

let modal;
import Icon from '@iconify/svelte';
export let closePosition = 'relative';
export let modalPosition = 'center';
export let closeButton = true;
export let escape = true;
export let exitOutside = true;
const dispatch = createEventDispatcher();

export function close() {
    dispatch('close');
}

function clickOutside() {
    if (!exitOutside) {
        return;
    }

    close();
}

document.body.style.overflowY = 'hidden';

onDestroy(() => {
    document.body.style.overflowY = 'scroll';
    console.log('destroyed');
});

const handle_keydown = (e) => {
    if (!escape) {
        return;
    }
    if (e.key === 'Escape') {
        close();
        return;
    }

    if (e.key === 'Tab') {
        // trap focus
        const nodes = modal.querySelectorAll('*');
        const tabbable = Array.from(nodes).filter((n) => n.tabIndex >= 0);

        let index = tabbable.indexOf(document.activeElement);
        if (index === -1 && e.shiftKey) index = 0;

        index += tabbable.length + (e.shiftKey ? -1 : 1);
        index %= tabbable.length;

        tabbable[index].focus();
        e.preventDefault();
    }
};

function closeFromChild() {
    close();
}
</script>

<svelte:window on:keydown={handle_keydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div transition:fade class="modal-background" on:click|self={clickOutside} bind:this={modal}>
    {#if closeButton}
        {#if closePosition == 'absolute'}
            <button class="modalbg_close" on:click={close}>
                <Icon icon="material-symbols:close" />
            </button>
        {/if}
    {/if}
    <div transition:scale class="modal" modal_position={modalPosition} role="dialog" aria-modal="true">
        {#if closeButton}
            {#if closePosition == 'relative'}
                <button class="modal_close" on:click={close}>
                    <Icon icon="material-symbols:close" height="36" />
                </button>
            {/if}
        {/if}
        <slot {closeFromChild} />
    </div>
</div>

<style lang="scss">
.modal-background {
    background-color: rgba(#23272e, 0.75);
    backdrop-filter: blur(6px);
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;

    display: flex;
    justify-content: center;
    align-items: center;

    z-index: 100;

    .modalbg_close {
        position: absolute;
        top: 1.5rem;
        right: 1.5rem;
        cursor: pointer;
        margin-right: 0.5rem;
        margin-top: 0.5rem;
        border-radius: 50px;
        height: 60px;
        width: 60px;
        font-size: 3rem;
        display: flex;
        justify-content: center;
        align-items: center;
        &:hover {
            background-color: #3d4045;
        }
    }
}

.modal {
    z-index: 101;
    position: absolute;
    overflow: auto;
    max-height: calc(100vh - 4em);
    width: fit-content;
    max-width: min(80vw, 800px);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: #1c1e22;
    border-radius: 1rem;
    padding: 2rem;

    &[modal_position='top'] {
        top: 5rem;
    }

    .modal_close {
        background-color: transparent;
        border: none;
        position: absolute;
        top: 0rem;
        right: 0rem;
        cursor: pointer;
        margin-right: 0.5rem;
        margin-top: 0.5rem;
        border-radius: 50px;
        display: flex;
        justify-content: center;
        align-items: center;
        &:hover {
            background-color: 33d4045;
        }
    }
}
</style>
