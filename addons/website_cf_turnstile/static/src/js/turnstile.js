/** @odoo-module **/

import "@website/snippets/s_website_form/000";  // force deps
import publicWidget from '@web/legacy/js/public/public_widget';
import { renderToElement } from "@web/core/utils/render";
import { session } from "@web/session";

publicWidget.registry.s_website_form.include({
        /**
         * @override
         */
        start: function () {
            const res = this._super(...arguments);
            this.cleanTurnstile();
            if (!this.isEditable && !this.$('.s_turnstile').length && session.turnstile_site_key) {
                // global callback for the turnstile script to call
                // Rethrow the error, or we only will catch a "Script error" without any info 
                // because of the script api.js originating from a different domain.
                function throwTurnstileError(code) {
                    const error = new Error("Turnstile Error");
                    error.code = code;
                    throw error;
                }
                const turnstileErrorGlobalScript = document.createElement("script");
                turnstileErrorGlobalScript.classList.add("s_turnstile");
                turnstileErrorGlobalScript.textContent = throwTurnstileError.toString();

                const mode = new URLSearchParams(window.location.search).get('cf') == 'show' ? 'always' : 'interaction-only';
                const turnstileContainer = renderToElement("website_cf_turnstile.turnstile_container", {
                    action: "website_form",
                    appearance: mode,
                    additionalClasses: "float-end",
                    errorGlobalCallback: throwTurnstileError.name,
                    sitekey: session.turnstile_site_key,
                });
                const turnstileScript = renderToElement("website_cf_turnstile.turnstile_remote_script");

                const sendButton = document.querySelector(".s_website_form_send, .o_website_form_send");
                sendButton.after(turnstileContainer, turnstileErrorGlobalScript, turnstileScript);
            }
            return res;
        },

        /**
         * Remove potential existing loaded script/token
         */
        cleanTurnstile: function () {
            if (this.$('.s_turnstile').length) {
                this.$('.s_turnstile').remove();
            }
        },

        /**
         * @override
         * Discard all library changes to reset the state of the Html.
         */
        destroy: function () {
            this.cleanTurnstile();
            this._super(...arguments);
        },
});
