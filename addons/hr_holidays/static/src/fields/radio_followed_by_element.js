import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { RadioField, radioField } from "@web/views/fields/radio/radio_field";
import {onMounted,onWillUnmount} from "@odoo/owl";

export class RadioFollowedByElement extends RadioField {
    //static template = "hr_holidays.RadioFollowedByElement";
    static props = {
        ...RadioField.props,
        links: { type: Object },
    };
    setup() {
        super.setup(...arguments);

        onMounted(() => {
            this.moveElement();
            this.observer = new MutationObserver((mutations) => {
                    if ([...mutations].map(mutation => [...mutation.addedNodes].map(node => node.id)).flat().filter(id => Object.values(this.props.links).includes(id))) this.moveElement()
                })

            this.observer.observe(document.getElementsByName("carryover").item(0), {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: false,
            })
        })

        onWillUnmount(() => {
            this.observer.disconnect()
        })
    }


    moveElement() {
        for (const [key, value] of Object.entries(this.props.links)) {
            let option = document.querySelectorAll("[data-value="+key+"]")[0]
            let elementToAppend = document.getElementById(value)
            if (option == null || elementToAppend == null || elementToAppend.parentElement === option.parentElement) return
            option.parentElement.appendChild(elementToAppend)
        }
    }
}

export const radioFollowedByElement = {
    ...radioField,
    component: RadioFollowedByElement,
    displayName: _t("RadioFollowedByElement"),
    supportedOptions: [
        {
            label: _t("Element association"),
            name: "links",
            type: "Object",
            help: _t("An object to link select options and element id to move"),
        }
    ],
    extractProps({ options }, dynamicInfo) {
        return {
            readonly: dynamicInfo.readonly,
            links: options.links,
        };
    },
};

registry.category("fields").add("radio_followed_by_element", radioFollowedByElement);
