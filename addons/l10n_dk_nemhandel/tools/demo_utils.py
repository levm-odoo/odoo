# Part of Odoo. See LICENSE file for full copyright and licensing details.

from base64 import b64encode
from decorator import decorator
import uuid

from odoo import _, fields, modules, tools
from odoo.tools.misc import file_open
from odoo.exceptions import ValidationError

DEMO_BILL_PATH = 'l10n_dk_nemhandel/tools/demo_bill'
DEMO_ENC_KEY = 'l10n_dk_nemhandel/tools/enc_key'
DEMO_PRIVATE_KEY = 'l10n_dk_nemhandel/tools/private_key.pem'

# -------------------------------------------------------------------------
# HELPERS
# -------------------------------------------------------------------------

def get_demo_vendor_bill(user):
    return {
        'direction': 'incoming',
        'receiver': user.edi_identification,
        'uuid': f'{user.company_id.id}_demo_vendor_bill',
        'accounting_supplier_party': '0208:2718281828',
        'state': 'done',
        'filename': f'{user.company_id.id}_demo_vendor_bill',
        'enc_key': file_open(DEMO_ENC_KEY, mode='rb').read(),
        'document': file_open(DEMO_BILL_PATH, mode='rb').read(),
    }


def _get_notification_message(proxy_state):
    if proxy_state == 'receiver':
        title = _("Registered to receive documents via Nemhandel (demo).")
        message = _("You can now receive demo vendor bills.")
    else:
        title = _("Registered as a sender (demo).")
        message = _("You can now send invoices in demo mode.")
    return title, message

# -------------------------------------------------------------------------
# MOCKED FUNCTIONS
# -------------------------------------------------------------------------

def _mock_make_request(func, self, *args, **kwargs):

    def _mock_get_all_documents(user, args, kwargs):
        if not user.env['account.move'].search_count([
            ('l10n_dk_nemhandel_message_uuid', '=', f'{user.company_id.id}_demo_vendor_bill')
        ]):
            return {'messages': [get_demo_vendor_bill(user)]}
        return {'messages': []}

    def _mock_get_document(user, args, kwargs):
        message_uuid = args[1]['message_uuids'][0]
        if message_uuid.endswith('_demo_vendor_bill'):
            return {message_uuid: get_demo_vendor_bill(user)}
        return {message_uuid: {'state': 'done'}}

    def _mock_send_document(user, args, kwargs):
        # Trigger the reception of vendor bills
        get_messages_cron = user.env['ir.cron'].sudo().env.ref(
            'l10n_dk_nemhandel.ir_cron_nemhandel_get_new_documents',
            raise_if_not_found=False,
        )
        if get_messages_cron:
            get_messages_cron._trigger()
        return {
            'messages': [{
                'message_uuid': 'demo_%s' % uuid.uuid4(),
            } for i in args[1]['documents']],
        }

    endpoint = args[0].split('/')[-1]
    return {
        'ack': lambda _user, _args, _kwargs: {},
        'activate_participant': lambda _user, _args, _kwargs: {},
        'get_all_documents': _mock_get_all_documents,
        'get_document': _mock_get_document,
        'participant_status': lambda _user, _args, _kwargs: {'nemhandel_state': 'active'},
        'send_document': _mock_send_document,
    }[endpoint](self, args, kwargs)

def _mock_button_verify_partner_endpoint(func, self, *args, **kwargs):
    self.ensure_one()
    old_value = self.nemhandel_verification_state
    if self.nemhandel_identifier_type and self.nemhandel_identifier_value:
        self.nemhandel_verification_state = 'valid'

def _mock_user_creation(func, self, *args, **kwargs):
    func(self, *args, **kwargs)
    self.l10n_dk_nemhandel_proxy_state = 'receiver' if self.receiver_registration else 'sender'
    self.nemhandel_edi_user.write({
        'private_key': b64encode(file_open(DEMO_PRIVATE_KEY, 'rb').read()),
    })
    return self._action_send_notification(
        *_get_notification_message(self.l10n_dk_nemhandel_proxy_state)
    )

def _mock_receiver_registration(func, self, *args, **kwargs):
    if not self.phone_number:
        raise ValidationError(_("Please enter a phone number to verify your application."))
    if not self.contact_email:
        raise ValidationError(_("Please enter a primary contact email to verify your application."))
    self.edi_user_id = self.edi_user_id.sudo()._register_proxy_user(self.company_id, 'nemhandel', self.edi_mode)
    self.l10n_dk_nemhandel_proxy_state = 'receiver'
    return self.env['nemhandel.registration']._action_send_notification(
        *_get_notification_message(self.l10n_dk_nemhandel_proxy_state)
    )

def _mock_check_verification_code(func, self, *args, **kwargs):
    self.button_nemhandel_sender_registration()
    self.edi_user_id.nemhandel_verification_code = False
    return self.env['nemhandel.registration']._action_send_notification(
        *_get_notification_message(self.l10n_dk_nemhandel_proxy_state)
    )

def _mock_deregister_participant(func, self, *args, **kwargs):
    # Set documents sent in demo to a state where they can be re-sent
    demo_moves = self.env['account.move'].search([
        ('company_id', '=', self.company_id.id),
        ('nemhandel_message_uuid', '=like', 'demo_%'),
    ])
    demo_moves.write({
        'nemhandel_message_uuid': None,
        'nemhandel_move_state': None,
    })
    demo_moves.message_main_attachment_id.unlink()
    demo_moves.ubl_cii_xml_id.unlink()
    log_message = _('The Nemhandel status of the documents has been reset when switching from Demo to Live.')
    demo_moves._message_log_batch(bodies=dict((move.id, log_message) for move in demo_moves))

    # also unlink the demo vendor bill
    self.env['account.move'].search([
        ('company_id', '=', self.company_id.id),
        ('nemhandel_message_uuid', '=', f'{self.company_id.id}_demo_vendor_bill'),
    ]).unlink()

    if 'nemhandel_edi_user' in self._fields:
        self.nemhandel_edi_user.unlink()
    else:
        self.edi_user_id.unlink()
    self.l10n_dk_nemhandel_proxy_state = 'not_registered'
    if 'nemhandel_edi_mode' in self._fields:
        self.nemhandel_edi_mode = 'demo'


def _mock_update_user_data(func, self, *args, **kwargs):
    pass


def _mock_check_company_on_nemhandel(func, self, *args, **kwargs):
    pass


_demo_behaviour = {
    '_make_request': _mock_make_request,
    'button_nemhandel_check_partner_endpoint': _mock_button_verify_partner_endpoint,
    'button_nemhandel_sender_registration': _mock_receiver_registration,
    'button_deregister_nemhandel_participant': _mock_deregister_participant,
    'button_update_nemhandel_user_data': _mock_update_user_data,
    'button_check_nemhandel_verification_code': _mock_check_verification_code,
    '_check_company_on_nemhandel': _mock_check_company_on_nemhandel,
}

# -------------------------------------------------------------------------
# DECORATORS
# -------------------------------------------------------------------------

@decorator
def handle_demo(func, self, *args, **kwargs):
    """ This decorator is used on methods that should be mocked in demo mode.

    First handle the decision: "Are we in demo mode?", and conditionally decide which function to
    execute. Whether we are in demo mode depends on the edi_mode of the EDI user, but the EDI user
    is accessible in different ways depending on the model the function is called from and in some
    contexts it might not yet exist, in which case demo mode should instead depend on the content
    of the "l10n_dk_nemhandel.edi.mode" config param.
    """
    def get_demo_mode_account_edi_proxy_client_user(self, args, kwargs):
        if self.id:
            return self.edi_mode == 'demo' and self.proxy_type == 'nemhandel'
        demo_param = self.env['ir.config_parameter'].get_param('l10n_dk_nemhandel.edi.mode') == 'demo'
        if len(args) > 1 and 'proxy_type' in args[1]:
            return demo_param and args[1]['proxy_type'] == 'nemhandel'
        return demo_param

    def get_demo_mode_res_config_settings(self, args, kwargs):
        if self.nemhandel_edi_user:
            return self.nemhandel_edi_user.edi_mode == 'demo'
        return self.env['ir.config_parameter'].get_param('l10n_dk_nemhandel.edi.mode') == 'demo'

    def get_demo_mode_nemhandel_registration(self, args, kwargs):
        if self.edi_user_id:
            return self.edi_user_id.edi_mode == 'demo'
        return self.env['ir.config_parameter'].get_param('l10n_dk_nemhandel.edi.mode') == 'demo'

    def get_demo_mode_res_partner(self, args, kwargs):
        nemhandel_edi_user = self.env.company.sudo().account_edi_proxy_client_ids.filtered(lambda user: user.proxy_type == 'nemhandel')
        if nemhandel_edi_user:
            return nemhandel_edi_user.edi_mode == 'demo'
        return False

    get_demo_mode = {
        'account_edi_proxy_client.user': get_demo_mode_account_edi_proxy_client_user,
        'res.config.settings': get_demo_mode_res_config_settings,
        'res.partner': get_demo_mode_res_partner,
        'nemhandel.registration': get_demo_mode_nemhandel_registration,
    }
    demo_mode = get_demo_mode.get(self._name) and get_demo_mode[self._name](self, args, kwargs) or False

    if not demo_mode or modules.module.current_test:
        return func(self, *args, **kwargs)
    return _demo_behaviour[func.__name__](func, self, *args, **kwargs)
