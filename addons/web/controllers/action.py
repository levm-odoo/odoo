# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
from odoo import _
from odoo.exceptions import AccessError, MissingError
from odoo.http import Controller, request, route
from .utils import clean_action
from werkzeug.exceptions import BadRequest


_logger = logging.getLogger(__name__)


class Action(Controller):

    @route('/web/action/load', type='json', auth='user', readonly=True)
    def load(self, action_id, additional_context=None):
        Actions = request.env['ir.actions.actions']
        value = False
        try:
            action_id = int(action_id)
        except ValueError:
            try:
                if '.' in action_id:
                    action = request.env.ref(action_id)
                    assert action._name.startswith('ir.actions.')
                else:
                    action = request.env['ir.actions.path'].sudo().search([('path', '=', action_id)]).action_id
                    assert action
                action_id = action.id
            except Exception as exc:
                raise MissingError(_("The action %r does not exist.", action_id)) from exc

        base_action = Actions.browse([action_id]).sudo().read(['type'])
        if base_action:
            action_type = base_action[0]['type']
            if action_type == 'ir.actions.report':
                request.update_context(bin_size=True)
            if additional_context:
                request.update_context(**additional_context)
            action = request.env[action_type].sudo().browse([action_id]).read()
            if action:
                value = clean_action(action[0], env=request.env)
        return value

    @route('/web/action/run', type='json', auth="user")
    def run(self, action_id, context=None):
        if context:
            request.update_context(**context)
        action = request.env['ir.actions.server'].browse([action_id])
        result = action.run()
        return clean_action(result, env=action.env) if result else False

    @route('/web/action/load_breadcrumbs', type='json', auth='user', readonly=True)
    def load_breadcrumbs(self, actions):
        result = []
        for action in actions:
            res = {}
            record_id = action.get('resId')
            try:
                if action.get('action'):
                    act = self.load(action.get('action'))
                    res['path'] = act['path']
                    if act['type'] == 'ir.actions.server':
                        if act['path']:
                            act = request.env['ir.actions.server'].browse(act['id']).run()
                        else:
                            result.append({'error': 'A server action must have a path to be restored'})
                            continue
                    if record_id:
                        res['display_name'] = request.env[act['res_model']].browse(record_id).display_name
                    else:
                        request.env[act['res_model']].check_access_rights('read')
                        # action shouldn't be available on its own if it doesn't have multi-record views
                        name = act['display_name'] if any(view[1] != 'form' and view[1] != 'search' for view in act['views']) else None
                        res['display_name'] = name
                elif action.get('model'):
                    Model = request.env[action.get('model')]
                    if record_id:
                        res['display_name'] = Model.browse(record_id).display_name
                    else:
                        # This case cannot be produced by the web client
                        raise BadRequest('Actions with a model should also have a resId')
                else:
                    raise BadRequest('Actions should have either an action (id or path) or a model')
                result.append(res)
            except (MissingError, AccessError) as exc:
                result.append({'error': str(exc)})
        return result
