<script>
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    dispatch("update", "captcha_disabled");
</script>
