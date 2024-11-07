# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import json

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.addons.l10n_in_ewaybill.tools.ewaybill_api import EWayBillApi, EWayBillError


class L10nInEwaybill(models.Model):

    _inherit = 'l10n.in.ewaybill'

    is_process_through_irn = fields.Boolean(compute='_compute_is_process_through_irn')

    @api.depends('account_move_id')
    def _compute_is_process_through_irn(self):
        for ewaybill in self:
            move_id = ewaybill.account_move_id
            ewaybill.is_process_through_irn = (
                move_id
                and move_id._l10n_in_check_einvoice_eligible()
            )

    def _ewaybill_generate_irn_json(self):
        return {
            'Irn': self.account_move_id.l10n_in_irn_number,
            'Distance': str(self.distance),
            **self._prepare_ewaybill_transportation_json_payload(),
        }

    def _compute_content(self):
        ewb_grouped = self.grouped('is_process_through_irn')
        for ewaybill in ewb_grouped.get(True, self.browse()):
            ewaybill_json = ewaybill._ewaybill_generate_irn_json()
            ewaybill.content = base64.b64encode(json.dumps(ewaybill_json).encode())
        super(L10nInEwaybill, ewb_grouped.get(False, self.browse()))._compute_content()

    def action_generate_ewaybill(self):
        ewb_grouped = self.grouped('is_process_through_irn')
        for ewaybill in ewb_grouped.get(True, self.browse()):
            if errors := ewaybill._check_configuration():
                raise UserError('\n'.join(errors))
            ewaybill._generate_ewaybill_by_irn()
        super(L10nInEwaybill, ewb_grouped.get(False, self.browse())).action_generate_ewaybill()

    def _generate_ewaybill_by_irn(self):
        self.ensure_one()
        self._lock_ewaybill()
        try:
            response = self._ewaybill_generate_by_irn(self._ewaybill_generate_irn_json())
        except EWayBillError as error:
            self._handle_error(error)
            return False
        self._handle_internal_warning_if_present(response)  # In case of error 604
        response_data = response.get('data', {})
        name = response_data.get('EwbNo')
        self._create_and_post_response_attachment(name, response)
        # Note: response keys are different then the direct one
        self._write_successfully_response({
            'name': name,
            'state': 'generated',
            'ewaybill_date': self._indian_timezone_to_odoo_utc(
                response_data['EwbDt']
            ),
            'ewaybill_expiry_date': self._indian_timezone_to_odoo_utc(
                response_data.get('EwbValidTill')
            ),
            **self._l10n_in_ewaybill_handle_zero_distance_alert_if_present(response_data)
        })
        self._cr.commit()

    def _ewaybill_generate_by_irn(self, json_payload):
        self.ensure_one()
        if not json_payload.get('Irn'):
            raise EWayBillError({
                'error': [{
                    'code': 'waiting',
                    'message': _("waiting For IRN generation To create E-waybill")
                }]
            })
        if not (token := self.company_id._l10n_in_edi_get_token()):
            raise EWayBillError({
                'error': [{
                    'code': '0',
                    'message': _(
                        "Unable to send E-waybill by IRN."
                        "Ensure GST Number set on company setting and EDI and Ewaybilll"
                        " credentials are Verified."
                    )
                }]
            })
        params = {
            'auth_token': token,
            'json_payload': json_payload,
        }
        response = self.account_move_id._l10n_in_edi_connect_to_server(
            url_path='/iap/l10n_in_edi/1/generate_ewaybill_by_irn',
            params=params
        )
        if response.get('error'):
            error_codes = [error.get('code') for error in response.get('error')]
            if 'no-credit' in error_codes:
                response['odoo_warning'].append({
                    'message': self.env['account.move']._l10n_in_edi_get_iap_buy_credits_message()
                })
            if '1005' in error_codes:
                # Invalid token eror then create new token and send generate request again.
                # This happen when authenticate called from another odoo instance with same credentials (like. Demo/Test)
                self.company_id._l10n_in_edi_authenticate()
                response = self.account_move_id._l10n_in_edi_connect_to_server(
                    url_path='/iap/l10n_in_edi/1/generate_ewaybill_by_irn',
                    params=params
                )
            if '4002' in error_codes or '4026' in error_codes:
                # Get E-waybill by details in case of IRN is already generated
                # this happens when timeout from the Government portal but E-waybill is generated
                self._ewaybill_get_by_irn()
                response.update({
                    'odoo_warning': [{
                        'message': EWayBillApi.DEFAULT_HELP_MESSAGE % 'generated',
                        'message_post': True
                    }]
                })
            if response.get('error'):
                raise EWayBillError(response)
        return response

    def _ewaybill_get_by_irn(self):
        if not (token := self.company_id._l10n_in_edi_get_token()):
            return self.env['account.move']._l10n_in_edi_no_config_response()
        params = {
            "auth_token": token,
            "irn": self.account_move_id.l10n_in_irn_number,
        }
        return self.account_move_id._l10n_in_edi_connect_to_server(
            url_path="/iap/l10n_in_edi/1/get_ewaybill_by_irn",
            params=params
        )
