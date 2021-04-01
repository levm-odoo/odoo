/** @odoo-module **/

const { Component, QWeb } = owl;

/**
 * Custom checkbox
 *
 * <CheckBox
 *    value="boolean"
 *    disabled="boolean"
 *    t-on-change="_onValueChange"
 *    >
 *    Change the label text
 *  </CheckBox>
 *
 * @extends Component
 */

export class CheckBox extends Component {
  _id = `checkbox-comp-${CheckBox.nextId++}`;
}

CheckBox.template = "wowl.CheckBox";
CheckBox.nextId = 1;

QWeb.registerComponent("CheckBox", CheckBox);
