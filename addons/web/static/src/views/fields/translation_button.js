/** @odoo-module **/

import { localization } from "@web/core/l10n/localization";
import { useOwnedDialogs, useService } from "@web/core/utils/hooks";
import { TranslationDialog } from "./translation_dialog";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

import { Component, useEnv } from "@odoo/owl";

/**
 * Prepares a function that will open the dialog that allows to edit translation
 * values for a given field.
 *
 * It is mainly a factorization of the feature that is also used
 * in legacy_fields. We expect it to be fully implemented in TranslationButton
 * when legacy code is removed.
 */
export function useTranslationDialog() {
    const addDialog = useOwnedDialogs();
    const env = useEnv();

    async function openTranslationDialog({ record, fieldName }) {
        if (!record.resId) {
            let _continue = true;
            await new Promise((resolve) => {
                addDialog(ConfirmationDialog, {
                    async confirm() {
                        _continue = await record.save({ stayInEdition: true });
                        resolve();
                    },
                    cancel() {
                        _continue = false;
                        resolve();
                    },
                    body: env._t(
                        "You need to save this new record before editing the translation. Do you want to proceed?"
                    ),
                    title: env._t("Warning"),
                });
            });
            if (!_continue) {
                return;
            }
        }
        const { resModel, resId } = record;

        addDialog(TranslationDialog, {
            fieldName: fieldName,
            resId: resId,
            resModel: resModel,
            userLanguageValue: record.data[fieldName] || "",
            isComingFromTranslationAlert: false,
            onSave: async () => {
                await record.load({}, { keepChanges: true });
                record.model.notify();
            },
        });
    }

    return openTranslationDialog;
}

export class TranslationButton extends Component {
    setup() {
        this.user = useService("user");
        this.translationDialog = useTranslationDialog();
    }

    get isMultiLang() {
        return localization.multiLang;
    }

    get lang() {
        const isTranslateBaseField = Boolean(
            this.props.record.fields[this.props.fieldName]["translate_value_name"]
        );
        return isTranslateBaseField ? this.user.lang.split("_")[0].toUpperCase() : "EN";
    }

    onClick() {
        const { fieldName, record } = this.props;
        this.translationDialog({ fieldName, record });
    }
}
TranslationButton.template = "web.TranslationButton";
TranslationButton.props = {
    fieldName: { type: String },
    record: { type: Object },
};
