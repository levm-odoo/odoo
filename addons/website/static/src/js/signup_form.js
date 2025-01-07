import { _t } from "@web/core/l10n/translation";
import FormEditorRegistry from "@website/js/form_editor_registry";

FormEditorRegistry.add('signup_form', {
    formFields: [{
        type: 'char',
        modelRequired: true,
        fillWith: 'login',
        name: 'login',
        string: _t('Your Email'),
    }, {
        type: 'char',
        modelRequired: true,
        fillWith: 'name',
        name: 'name',
        string: _t('Your Name'),
    },
    {
        type: 'password',
        modelRequired: true,
        fillWith: 'password',
        name: 'password',
        string: _t('Password'),
    }, {
        type: 'password',
        modelRequired: true,
        fillWith: 'confirm_password',
        name: 'confirm_password',
        string: _t('Confirm Password'),
    }
],
});
