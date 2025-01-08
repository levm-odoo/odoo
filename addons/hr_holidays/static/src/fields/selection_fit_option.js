import {registry} from "@web/core/registry";
import {selectionField, SelectionField} from "@web/views/fields/selection/selection_field";
import {onMounted} from "@odoo/owl";

const fieldRegistry = registry.category("fields");

class SelectionFitOption extends SelectionField {
    static template = "hr_holidays.SelectionFitOption"

    setup() {
        super.setup()
        onMounted(async() => this.autoWidth())
    }

    autoWidth() {
        let select = document.getElementById(this.props.id)
        if (select == null) return
        let fakeSelect = document.createElement("select")
        let fakeOption = document.createElement("option")
        let fakeText = document.createTextNode(select.selectedOptions[0].label)
        fakeSelect.style.width = "auto"
        fakeSelect.style.minWidth = "0"
        fakeOption.appendChild(fakeText)
        fakeSelect.appendChild(fakeOption)
        select.parentElement.appendChild(fakeSelect)
        select.parentElement.style.width = fakeSelect.offsetWidth + 10 + "px"
        select.parentElement.removeChild(fakeSelect)
    }
}

const selectionFitOption = {...selectionField, component: SelectionFitOption};

fieldRegistry.add("selection_fit_option", selectionFitOption);
