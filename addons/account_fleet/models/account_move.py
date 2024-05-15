# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, fields, api, _


class AccountMove(models.Model):
    _inherit = 'account.move'

    def _post(self, soft=True):
        vendor_bill_service = self.env.ref('account_fleet.data_fleet_service_type_vendor_bill', raise_if_not_found=False)
        if not vendor_bill_service:
            return super()._post(soft)

        val_list = []
        log_list = []
        posted = super()._post(soft)
        for line in posted.line_ids.filtered(
            lambda ml: ml.vehicle_id and ml.move_id.move_type == 'in_invoice' and ml.display_type == "product"):
            val = line._prepare_fleet_log_service()
            log = _('Service Vendor Bill: %s', line.move_id._get_html_link())
            val_list.append(val)
            log_list.append(log)
        log_service_ids = self.env['fleet.vehicle.log.services'].create(val_list)
        for log_service_id, log in zip(log_service_ids, log_list):
            log_service_id.message_post(body=log)
        return posted

    def button_draft(self):
        lines = self.mapped('line_ids')
        log_services = self.env['fleet.vehicle.log.services'].sudo().search([
            ('account_move_line_id.id', 'in', lines.ids),
        ])

        res = super().button_draft()

        if log_services:
            log_services.unlink()

        return res


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    vehicle_id = fields.Many2one('fleet.vehicle', string='Vehicle', index='btree_not_null')
    # used to decide whether the vehicle_id field is editable
    need_vehicle = fields.Boolean(compute='_compute_need_vehicle')

    def _compute_need_vehicle(self):
        self.need_vehicle = False

    def _prepare_fleet_log_service(self):
        vendor_bill_service = self.env.ref('account_fleet.data_fleet_service_type_vendor_bill', raise_if_not_found=False)
        return {
            'service_type_id': vendor_bill_service.id,
            'vehicle_id': self.vehicle_id.id,
            'vendor_id': self.partner_id.id,
            'description': self.name,
            'account_move_line_id': self.id,
        }
