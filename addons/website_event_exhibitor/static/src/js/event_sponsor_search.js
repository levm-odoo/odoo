/** @odoo-module **/

import publicWidget from "@web/legacy/js/public/public_widget";
publicWidget.registry.websiteEventSearchSponsor = publicWidget.Widget.extend({

    selector: '.o_wesponsor_index',
    events: {
        'click .o_wevent_event_search_box .btn': '_onSearch',
        'click .o_search_tag .btn': '_onTagRemove',
        'click .o_dropdown_reset_tags': '_onTagReset',
        'change .o_wevent_event_tags_form input': '_onTagAdd',
        'change .o_wevent_event_tags_mobile_form input': '_onTagAddMobile',
    },

    start: function () {
        this.form = this.el.querySelector('.o_wevent_event_tags_form');
        this.mobileForm = this.el.querySelector('.o_wevent_event_tags_mobile_form');
        return this._super.apply(this, arguments);
    },

    _onSearch: function () {
        const input = this.el.querySelector('.o_wevent_event_search_box input');
        const params = new URLSearchParams(window.location.search);
        params.set('search', input.value);
        const url = window.location.pathname + '?' + params.toString();
        this.form.action = url;
        this.form.submit();
    },

    _onTagAdd: function () {
        this.form.submit();
    },

    _onTagAddMobile: function () {
        this.mobileForm.submit();
    },

    _onTagRemove: function (event) {
        const tag = event.target.parentNode;
        const data = tag.dataset;
        const selector = 'input[name="' + data.field + '"][value="' + data.value + '"]';
        this._updateFormActionURL(data);
        this.form.querySelector(selector).checked = false;
        this.form.submit();
    },

    _onTagReset: function (event) {
        const dropdown = event.target.parentNode;
        dropdown.querySelectorAll('input').forEach(input => input.checked = false);
        this.form.submit();
    },

    _updateFormActionURL: function (data) {
        const mapping = new Map([
            ['sponsor_country', 'countries'],
            ['sponsor_type', 'sponsorships']
        ]);
        if (!mapping.has(data.field)) {
            return
        }
        const name = mapping.get(data.field);
        const params = new URLSearchParams(window.location.search);
        try {
            const ids = JSON.parse(params.get(name));
            params.set(name, JSON.stringify(ids.filter(id => id !== data.value)));
            this.form.action = `${window.location.href.split('?')[0]}?${params.toString()}`;
        } catch {
            return;
        }
    },
});

export default publicWidget.registry.websiteEventSearchSponsor;
