odoo.define('website_event_track.website_event_track_proposal_form_tags', function (require) {
'use strict';

var core = require('web.core');
var publicWidget = require('web.public.widget');

var _t = core._t;

publicWidget.registry.websiteEventTrackProposalFormTags = publicWidget.Widget.extend({
    selector: '.o_website_event_track_proposal_form_tags',

    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            self._bindSelect2Dropdown();
        });
    },

    /**
     * Handler for select2 on tags added to the proposal track form.
     *
     * @private
     */
    _bindSelect2Dropdown: function () {
        var self = this;
        this.$('.o_wetrack_select2_tags').select2(this._select2Wrapper(_t('Select categories'),
            function () {
                return self._rpc({
                    route: "/event/track_tag/search_read",
                    params: {
                        fields: ['name', 'category_id'],
                        domain: [],
                    }
                });
            })
        );
    },

    /**
     * Wrapper for select2. Load data from server once and store it.
     * Tags are sorted in alphabetical order and have format "tag.category.name : tag.name"
     * Or "tag.name" if tag does not belong to any category.
     *
     * @private
     * @param {String} tag - Placeholder for element.
     * @param {Function} fetchFNC - Fetch data from remote location. Should return a Promise.
     * Resolved data should be array of objects with id and name. eg. [{'id': id, 'name': 'text'}, ...]
     * @param {String} nameKey - (optional) the name key of the returned record
     * ('name' if not provided)
     * @returns {Object} select2 wrapper object
    */
    _select2Wrapper: function (tag, fetchFNC, nameKey) {
        nameKey = nameKey || 'name';

        var values = {
            placeholder: tag,
            allowClear: true,
            formatNoMatches: _t('No results found'),
            selection_data: false,
            fetch_rpc_fnc: fetchFNC,
            multiple: 'multiple',
            sorter: data => data.sort((a, b) => a.text.localeCompare(b.text)),

            // category_id structure : [id, tag category name]
            fill_data: function (query, data) {
                var that = this,
                    tags = {results: []};
                data.forEach( function (obj) {
                    // select tags matching either category or tag name
                    if (that.matcher(query.term, obj[nameKey]) || that.matcher(query.term, obj.category_id[1])) {
                        if (obj.category_id[1]) {
                            tags.results.push({id: obj.id, text: obj.category_id[1] + " : " + obj[nameKey]});
                        } else {
                            tags.results.push({id: obj.id, text: obj[nameKey]});
                        }
                    }
                });
                query.callback(tags);
            },

            query: function (query) {
                var that = this;
                // fetch data only once and store it
                if (!this.selection_data) {
                    this.fetch_rpc_fnc().then(function (data) {
                        that.fill_data(query, data);
                        that.selection_data = data;
                    });
                } else {
                    this.fill_data(query, this.selection_data);
                }
            }
        };
        return values;
    },
});

return publicWidget.registry.websiteEventTrackProposalFormTags;

});
