# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import controllers
from .models import (
    AccountJournal, AccountMove, AccountMoveSend, Account_Edi_Proxy_ClientUser,
    ResCompany, ResConfigSettings, ResPartner,
)
from .wizard import (
    AccountMoveSendBatchWizard, AccountMoveSendWizard, Account_PeppolService,
    Account_PeppolServiceWizard, PeppolRegistration,
)
from . import tools


def _account_peppol_post_init(env):
    for company in env['res.company'].sudo().search([]):
        env['ir.default'].set('res.partner', 'peppol_verification_state', 'not_verified', company_id=company.id)
