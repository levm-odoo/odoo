/** @odoo-module **/

import publicWidget from '@web/legacy/js/public/public_widget';
import { rpc } from '@web/core/network/rpc';

publicWidget.registry.portalAddress = publicWidget.Widget.extend({
    selector: '#address_checkout_billing, #address_checkout_shipping',
    events: {
        'click .js_set_default': '_changePortalAddress',
    },

    /**
     * Set the billing or shipping address on the order and update the corresponding card.
     *
     * @private
     * @param {Event} ev
     * @return {void}
     */
    async _changePortalAddress(ev) {
        ev.preventDefault();
        const setDefaultButton = ev.currentTarget;
        const card = setDefaultButton.closest('.card');

        const oldCard = card.closest('.row').querySelector('.card.border.border-primary');
        if (oldCard) {
            oldCard.classList.add(card.dataset.mode === 'invoice' ? 'js_change_billing' : 'js_change_delivery');
            oldCard.classList.remove('bg-primary', 'border', 'border-primary');
            this._toggleCardButtons(oldCard, true);
        }
        card.classList.remove('js_change_billing', 'js_change_delivery');
        card.classList.add('bg-primary', 'border', 'border-primary');
        this._toggleCardButtons(card, false);

        await rpc('/address/update_address', {
            mode: setDefaultButton.dataset.mode,
            partner_id: setDefaultButton.dataset.partnerId,
        });

        location.reload();
    },

    _toggleCardButtons(card, show) {
        const deleteButton = card.querySelector('#delete-button');
        const defaultButton = card.querySelector('#default-button');
        if (deleteButton) {
            deleteButton.style.display = show ? 'inline-block' : 'none';
        }
        if (defaultButton) {
            defaultButton.style.display = show ? 'inline-block' : 'none';
        }
    },
});

export default publicWidget.registry.portalAddress;