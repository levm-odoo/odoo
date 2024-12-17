import base64
import uuid
from lxml import etree
from odoo import _
from odoo import fields, models, api
from odoo.addons.l10n_tr_nilvera_edespatch.models.l10n_tr_nilvera_common import L10N_TR_COUNTRIES
from odoo.exceptions import UserError
from odoo.tools import cleanup_xml_node


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    l10n_tr_nilvera_despatch_scenario = fields.Selection(
        string="Despatch Scenario",
        selection=[('TEMELIRSALIYE', 'Temel Irsaliye'), ('HALTIPI', 'Hal Tipi')],
        default='TEMELIRSALIYE',
        required=True
    )
    l10n_tr_nilvera_despatch_type = fields.Selection(
        string="Despatch Type",
        selection=[('SEVK', 'Sevk'), ('MATBUDAN', 'Matbudan')],
        default='SEVK',
        required=True
    )
    l10n_tr_nilvera_carrier_id = fields.Many2one(string="Carrier", comodel_name='res.partner')
    l10n_tr_nilvera_buyer_id = fields.Many2one(
        string="Buyer",
        comodel_name='res.partner'
    )
    l10n_tr_nilvera_seller_supplier_id = fields.Many2one(
        string="Seller Supplier",
        comodel_name='res.partner'
    )
    l10n_tr_nilvera_buyer_originator_id = fields.Many2one(
        string="Buyer Originator",
        comodel_name='res.partner'
    )
    l10n_tr_nilvera_delivery_printed_number = fields.Char("Printed Delivery Note Number")
    l10n_tr_nilvera_delivery_date = fields.Date("Printed Delivery Note Date")
    l10n_tr_vehicle_plate = fields.Char("Vehicle Plate")
    l10n_tr_nilvera_trailer_plate_ids = fields.Many2many(
        string="Trailer Plates",
        comodel_name='l10n_tr.nilvera.trailer.plate',
        relation='l10n_tr_nilvera_delivery_vehicle_rel'
    )
    l10n_tr_nilvera_driver_ids = fields.Many2many(string="Drivers", comodel_name='res.partner')
    l10n_tr_nilvera_delivery_notes = fields.Char(string="Delivery Notes")
    l10n_tr_nilvera_despatch_state = fields.Selection(
        string="State",
        selection=[('to_send', "To Send"), ('sent', "Sent")],
        compute='_compute_l10n_tr_nilvera_despatch_state',
        store=True,
        readonly=False,
        tracking=True,
    )
    l10n_tr_nilvera_edespatch_warnings = fields.Json()

    @api.depends('state')
    def _compute_l10n_tr_nilvera_despatch_state(self):
        for record in self:
            if record.state == 'done':
                record.l10n_tr_nilvera_despatch_state = 'to_send'

    def _validate_edelivery_fields(self):
        if self.state != 'done':
            self.l10n_tr_nilvera_edespatch_warnings = {
                'invalid_transfer_state': {
                    'message': _("Please validate the transfer first to generate the XML"),
                }
            }
            return False
        if self.l10n_tr_nilvera_despatch_scenario == 'HALTIPI':
            self.l10n_tr_nilvera_edespatch_warnings = {
                'invalid_delivery_scenario': {
                    'message': _("Despatch Scenario as Hal Tipi is currently unsupported in the module."),
                }
            }
            return False
        error_messages = {}
        if self.l10n_tr_nilvera_despatch_type == 'MATBUDAN':
            if not self.l10n_tr_nilvera_delivery_date:
                error_messages.update({
                    'invalid_matbu_date': {
                        'message': _("Printed Delivery Note Date is required."),
                    }
                })
            if not self.l10n_tr_nilvera_delivery_printed_number:
                error_messages.update({
                    'invalid_matbu_number': {
                        'message': _("Printed Delivery Note Number is required."),
                    }
                })
            elif not len(self.l10n_tr_nilvera_delivery_printed_number or "") == 16:
                error_messages.update({
                    'invalid_matbu_number': {
                        'message': _("Length of Printed Delivery Number must be of 16 Characters."),
                    }
                })

        partners = (
            self.env.company.partner_id
            | self.partner_id
            | self.l10n_tr_nilvera_carrier_id
            | self.l10n_tr_nilvera_buyer_id
            | self.l10n_tr_nilvera_seller_supplier_id
            | self.l10n_tr_nilvera_buyer_originator_id
        )
        for partner in partners:
            if error := partner._l10n_tr_nilvera_validate_partner_details():
                error_messages.update(error)

        invalid_drivers = self.l10n_tr_nilvera_driver_ids.filtered(lambda x: not x.vat or (x.vat and len(x.vat) != 11))
        if drivers := len(invalid_drivers):
            error_messages.update(
                {
                    'invalid_drivers': {
                        'message': _("%s TCKN is required.", drivers == 1 and f"{invalid_drivers.name}'s" or "Drivers"),
                        'action_text': _("View %s", drivers == 1 and invalid_drivers.name or "Drivers"),
                        'action': invalid_drivers._get_records_action(name=_("Drivers")),
                    }
                }
            )
        if not self.l10n_tr_nilvera_carrier_id and not self.l10n_tr_nilvera_driver_ids:
            error_messages.update({
                'required_driver_details': {
                    'message': _("At least one Driver is required."),
                }
            })
        if not self.l10n_tr_nilvera_carrier_id and not self.l10n_tr_vehicle_plate:
            error_messages.update({
                'required_vehicle_details': {
                    'message': _("Vehicle Plate is required."),
                }
            })
        if error_messages:
            self.l10n_tr_nilvera_edespatch_warnings = error_messages
            return False
        self.l10n_tr_nilvera_edespatch_warnings = False
        return True

    def export_delivery_note(self):
        if self.l10n_tr_nilvera_edespatch_warnings:
            return False
        try:
            despatch_uuid = str(uuid.uuid4())
            drivers = []
            for driver in self.l10n_tr_nilvera_driver_ids:
                name, fname = (' ' in driver.name and driver.name.split(' ', 1)) or (driver.name, '')
                drivers.append({
                    'name': name,
                    'fname': fname,
                    'tckn': driver.vat
                })
            scheduled_date_local = fields.Datetime.context_timestamp(
                self.with_context(tz='Europe/Istanbul'),
                self.scheduled_date
            )
            date_done_local = fields.Datetime.context_timestamp(
                self.with_context(tz='Europe/Istanbul'),
                self.date_done
            )
            values = {
                'ubl_version_id': 2.1,
                'customization_id': 'TR1.2.1',
                'uuid': despatch_uuid,
                'copy_indicator': 'false',
                'picking': self,
                'current_company': self.env.company.partner_id,
                'issue_date': scheduled_date_local.date().strftime('%Y-%m-%d'),
                'issue_time': scheduled_date_local.time().strftime('%H:%M:%S'),
                'actual_date': date_done_local.strftime('%Y-%m-%d'),
                'actual_time': date_done_local.strftime('%H:%M:%S'),
                'line_count': len(self.move_ids_without_package),
                'printed_date': self.l10n_tr_nilvera_delivery_date and self.l10n_tr_nilvera_delivery_date.strftime('%Y-%m-%d'),
                'drivers': drivers,
                'countries': L10N_TR_COUNTRIES,
                'default_tckn': '22222222222'
            }
            xml_content = self.env['ir.qweb']._render(
                'l10n_tr_nilvera_edespatch.l10n_tr_edespatch_format',
                values
            )
            xml_string = etree.tostring(
                cleanup_xml_node(xml_content),
                pretty_print=False,
                encoding='UTF-8',
            )

            attachment = self.env['ir.attachment'].create({
                'name': f"{self.name} e-Irsaliye.xml",
                'datas': base64.b64encode(xml_string),
                'res_model': self._name,
                'res_id': self.id,
                'type': 'binary',
            })

            self.message_post(
                body=_("e-Despatch XML file generated successfully."),
                attachment_ids=[attachment.id],
                subtype_xmlid='mail.mt_note'
            )
            return True
        except Exception as e:
            self.message_post(
                body=f"Error while generation of XML file: {e}",
                subtype_xmlid='mail.mt_note'
            )
            return False

    def action_export_delivery_note(self):
        if len(self) == 1:
            if self.picking_type_code == 'outgoing' and self._validate_edelivery_fields():
                self.export_delivery_note()
            return
        errors = []
        for record in self:
            if record.picking_type_code == 'outgoing':
                if not record._validate_edelivery_fields():
                    errors.append(record.name)
                else:
                    record.export_delivery_note()
        if errors:
            raise UserError(_("Error occured in generating following records:\n- %s", '\n- '.join(errors)))

    def action_mark_edespatch_status(self):
        for record in self:
            record.l10n_tr_nilvera_despatch_state = 'sent'
