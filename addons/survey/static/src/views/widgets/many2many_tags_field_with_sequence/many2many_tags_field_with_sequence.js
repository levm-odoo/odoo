import {
    Many2ManyTagsField,
    many2ManyTagsField,
} from "@web/views/fields/many2many_tags/many2many_tags_field";
import { Many2XAutocomplete } from "@web/views/fields/relational_utils";
import { TagsListWithSequence } from "./tags_list_with_sequence";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

export class Many2ManyTagsFieldWithSequence extends Many2ManyTagsField {
    static template = "survey.Many2ManyTagsFieldWithSequence";
    static components = {
        TagsListWithSequence,
        Many2XAutocomplete,
    };
    static props = {
        ...Many2ManyTagsField.props,
        sequenceField: { type: String, optional: true },
    };

    getTagProps(record) {
        return Object.assign(super.getTagProps(record), {
            sequence: record.data[this.props.sequenceField],
        });
    }
}

export const many2ManyTagsFieldWithSequence = {
    ...many2ManyTagsField,
    component: Many2ManyTagsFieldWithSequence,
    displayName: _t("Tags with optional sequence"),
    supportedOptions: [
        ...many2ManyTagsField.supportedOptions,
        {
            label: _t("Sequence field"),
            name: "sequence_field",
            availableTypes: ["integer"],
            help: _t("Set an integer field to order selected tags by sequence."),
        },
    ],
    relatedFields: ({ options }) => {
        const relatedFields = many2ManyTagsField.relatedFields({ options });
        if (options.sequence_field) {
            relatedFields.push({ name: options.sequence_field, type: "integer", readonly: false });
        }
        return relatedFields;
    },
    extractProps({ attrs, options, string }, dynamicInfo) {
        return {
            ...many2ManyTagsField.extractProps(...arguments),
            sequenceField: options.sequence_field,
        };
    },
};

registry.category("fields").add("many2many_tags_with_sequence", many2ManyTagsFieldWithSequence);
