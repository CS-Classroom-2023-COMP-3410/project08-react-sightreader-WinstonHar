// vite.config.js
import { defineConfig } from 'vite';
import react from "@vitejs/plugin-react";


export default defineConfig({
    plugins: [react()],

    resolve: {
        // Ensure Vite uses the browser version of jQuery.
        alias: {
            jquery: 'jquery/dist/jquery.min.js'
        },
        // You can also specify the order in which fields are resolved.
        mainFields: ['browser', 'module', 'main']
    }
});