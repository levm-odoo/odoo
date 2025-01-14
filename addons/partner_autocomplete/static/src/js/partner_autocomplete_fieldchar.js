import { AutoComplete } from "@web/core/autocomplete/autocomplete";
import { useChildRef, useService } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { CharField, charField } from "@web/views/fields/char/char_field";
import { useInputField } from "@web/views/fields/input_field_hook";

import { usePartnerAutocomplete } from "@partner_autocomplete/js/partner_autocomplete_core"

export class PartnerAutoCompleteCharField extends CharField {
    static template = "partner_autocomplete.PartnerAutoCompleteCharField";
    static components = {
        ...CharField.components,
        AutoComplete,
    };
    setup() {
        super.setup();

        this.orm = useService("orm");
        this.action = useService("action");
        this.partner_autocomplete = usePartnerAutocomplete();

        this.inputRef = useChildRef();
        useInputField({ getValue: () => this.props.record.data[this.props.name] || "", parse: (v) => this.parse(v), ref: this.inputRef});
    }

    async validateSearchTerm(request) {
        return request && request.length > 2;
    }

    get sources() {
        return [
            {
                options: async (request) => {
                    if (await this.validateSearchTerm(request)) {
                        const suggestions = await this.partner_autocomplete.autocomplete(request);
                        suggestions.forEach((suggestion) => {
                            suggestion.classList = "partner_autocomplete_dropdown_char";
                        });
                        return suggestions;
                    }
                    else {
                        return [];
                    }
                },
                optionTemplate: "partner_autocomplete.CharFieldDropdownOption",
                placeholder: _t('Searching Autocomplete...'),
            },
        ];
    }

    async onSelect(option) {
        const data = await this.partner_autocomplete.getCreateData(Object.getPrototypeOf(option));

        // Some fields are unnecessary in res.company
        if (this.props.record.resModel === 'res.company') {
            const fields = ['comment', 'child_ids', 'additional_info'];
            fields.forEach((field) => {
                delete data.company[field];
            });
        }

        // Many2many fields: create tags
        if (this.props.record.resModel === 'res.partner') {
            await this.props.record.save();
            await this.orm.call("res.partner", "iap_partner_autocomplete_add_tags", [this.props.record.resId, data.company.tags]);
            delete data.company.tags;
            await this.props.record.load();
        }

        // Format the many2one fields
        const many2oneFields = ['country_id', 'state_id'];
        many2oneFields.forEach((field) => {
            if (data.company[field]) {
                data.company[field] = [data.company[field].id, data.company[field].display_name];
            }
        });
        this.props.record.update(data.company);
        if (this.props.setDirty) {
            this.props.setDirty(false);
        }
    }
}

export const partnerAutoCompleteCharField = {
    ...charField,
    component: PartnerAutoCompleteCharField,
};

registry.category("fields").add("field_partner_autocomplete", partnerAutoCompleteCharField);
