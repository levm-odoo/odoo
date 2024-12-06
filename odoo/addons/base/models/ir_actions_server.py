import contextlib
import json
import logging
from functools import partial, reduce
from operator import getitem

import requests

from odoo import Command, _, api, fields, models
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tools.safe_eval import safe_eval, test_python_expr

_logger = logging.getLogger(__name__)
_server_action_logger = _logger.getChild("server_action_safe_eval")


class LoggerProxy:
    """ Proxy of the `_logger` element in order to be used in server actions.
    We purposefully restrict its method as it will be executed in `safe_eval`.
    """
    @staticmethod
    def log(level, message, *args, stack_info=False, exc_info=False):
        _server_action_logger.log(level, message, *args, stack_info=stack_info, exc_info=exc_info)

    @staticmethod
    def info(message, *args, stack_info=False, exc_info=False):
        _server_action_logger.info(message, *args, stack_info=stack_info, exc_info=exc_info)

    @staticmethod
    def warning(message, *args, stack_info=False, exc_info=False):
        _server_action_logger.warning(message, *args, stack_info=stack_info, exc_info=exc_info)

    @staticmethod
    def error(message, *args, stack_info=False, exc_info=False):
        _server_action_logger.error(message, *args, stack_info=stack_info, exc_info=exc_info)

    @staticmethod
    def exception(message, *args, stack_info=False, exc_info=True):
        _server_action_logger.exception(message, *args, stack_info=stack_info, exc_info=exc_info)


WEBHOOK_SAMPLE_VALUES = {
    "integer": 42,
    "float": 42.42,
    "monetary": 42.42,
    "char": "Hello World",
    "text": "Hello World",
    "html": "<p>Hello World</p>",
    "boolean": True,
    "selection": "option1",
    "date": "2020-01-01",
    "datetime": "2020-01-01 00:00:00",
    "binary": "<base64_data>",
    "many2one": 47,
    "many2many": [42, 47],
    "one2many": [42, 47],
    "reference": "res.partner,42",
    None: "some_data",
}


class IrActionsServer(models.Model):
    """ Server actions model. Server action work on a base model and offer various
    type of actions that can be executed automatically, for example using base
    action rules, of manually, by adding the action in the 'More' contextual
    menu.

    Since Odoo 8.0 a button 'Create Menu Action' button is available on the
    action form view. It creates an entry in the More menu of the base model.
    This allows to create server actions and run them in mass mode easily through
    the interface.

    The available actions are :

    - 'Execute Python Code': a block of python code that will be executed
    - 'Create a new Record': create a new record with new values
    - 'Write on a Record': update the values of a record
    - 'Execute several actions': define an action that triggers several other
      server actions
    """
    _description = 'Server Actions'
    _table = 'ir_act_server'
    _inherit = ['ir.actions.actions']
    _order = 'sequence,name'
    _allow_sudo_commands = False

    DEFAULT_PYTHON_CODE = """# Available variables:
#  - env: environment on which the action is triggered
#  - model: model of the record on which the action is triggered; is a void recordset
#  - record: record on which the action is triggered; may be void
#  - records: recordset of all records on which the action is triggered in multi-mode; may be void
#  - time, datetime, dateutil, timezone: useful Python libraries
#  - float_compare: utility function to compare floats based on specific precision
#  - b64encode, b64decode: functions to encode/decode binary data
#  - log: log(message, level='info'): logging function to record debug information in ir.logging table
#  - _logger: _logger.info(message): logger to emit messages in server logs
#  - UserError: exception class for raising user-facing warning messages
#  - Command: x2many commands namespace
# To return an action, assign: action = {...}\n\n\n\n"""

    @api.model
    def _default_update_path(self):
        if not self.env.context.get('default_model_id'):
            return ''
        ir_model = self.env['ir.model'].browse(self.env.context['default_model_id'])
        model = self.env[ir_model.model]
        sensible_default_fields = ['partner_id', 'user_id', 'user_ids', 'stage_id', 'state', 'active']
        for field_name in sensible_default_fields:
            if field_name in model._fields and not model._fields[field_name].readonly:
                return field_name
        return ''

    name = fields.Char(required=True)
    type = fields.Char(default='ir.actions.server')
    usage = fields.Selection([
        ('ir_actions_server', 'Server Action'),
        ('ir_cron', 'Scheduled Action')], string='Usage',
        default='ir_actions_server', required=True)
    state = fields.Selection([
        ('object_write', 'Update Record'),
        ('object_create', 'Create Record'),
        ('code', 'Execute Code'),
        ('webhook', 'Send Webhook Notification'),
        ('multi', 'Execute Existing Actions')], string='Type',
        default='object_write', required=True, copy=True,
        help="Type of server action. The following values are available:\n"
             "- 'Update a Record': update the values of a record\n"
             "- 'Create Activity': create an activity (Discuss)\n"
             "- 'Send Email': post a message, a note or send an email (Discuss)\n"
             "- 'Send SMS': send SMS, log them on documents (SMS)"
             "- 'Add/Remove Followers': add or remove followers to a record (Discuss)\n"
             "- 'Create Record': create a new record with new values\n"
             "- 'Execute Code': a block of Python code that will be executed\n"
             "- 'Send Webhook Notification': send a POST request to an external system, also known as a Webhook\n"
             "- 'Execute Existing Actions': define an action that triggers several other server actions\n")
    # Generic
    sequence = fields.Integer(default=5,
                              help="When dealing with multiple actions, the execution order is "
                                   "based on the sequence. Low number means high priority.")
    model_id = fields.Many2one('ir.model', string='Model', required=True, ondelete='cascade', index=True,
                               help="Model on which the server action runs.")
    available_model_ids = fields.Many2many('ir.model', string='Available Models', compute='_compute_available_model_ids', store=False)
    model_name = fields.Char(related='model_id.model', string='Model Name')
    # Python code
    code = fields.Text(string='Python Code', groups='base.group_system',
                       default=DEFAULT_PYTHON_CODE,
                       help="Write Python code that the action will execute. Some variables are "
                            "available for use; help about python expression is given in the help tab.")
    # Multi
    child_ids = fields.Many2many('ir.actions.server', 'rel_server_actions', 'server_id', 'action_id',
                                 string='Child Actions', help='Child server actions that will be executed. Note that the last return returned action value will be used as global return value.')
    # Create
    crud_model_id = fields.Many2one(
        'ir.model', string='Record to Create',
        compute='_compute_crud_relations', readonly=False, store=True,
        help="Specify which kind of record should be created. Set this field only to specify a different model than the base model.")
    crud_model_name = fields.Char(related='crud_model_id.model', string='Target Model Name', readonly=True)
    link_field_id = fields.Many2one(
        'ir.model.fields', string='Link Field',
        compute='_compute_link_field_id', readonly=False, store=True,
        help="Specify a field used to link the newly created record on the record used by the server action.")
    groups_id = fields.Many2many('res.groups', 'ir_act_server_group_rel',
                                 'act_id', 'gid', string='Allowed Groups', help='Groups that can execute the server action. Leave empty to allow everybody.')

    update_field_id = fields.Many2one('ir.model.fields', string='Field to Update', ondelete='cascade', compute='_compute_crud_relations', store=True, readonly=False)
    update_path = fields.Char(string='Field to Update Path', help="Path to the field to update, e.g. 'partner_id.name'", default=_default_update_path)
    update_related_model_id = fields.Many2one('ir.model', compute='_compute_crud_relations', store=True)
    update_field_type = fields.Selection(related='update_field_id.ttype', readonly=True)
    update_m2m_operation = fields.Selection([
        ('add', 'Adding'),
        ('remove', 'Removing'),
        ('set', 'Setting it to'),
        ('clear', 'Clearing it')
    ], string='Many2many Operations', default='add')
    update_boolean_value = fields.Selection([('true', 'Yes (True)'), ('false', "No (False)")], string='Boolean Value', default='true')

    value = fields.Text(help="For Python expressions, this field may hold a Python expression "
                             "that can use the same values as for the code field on the server action,"
                             "e.g. `env.user.name` to set the current user's name as the value "
                             "or `record.id` to set the ID of the record on which the action is run.\n\n"
                             "For Static values, the value will be used directly without evaluation, e.g."
                             "`42` or `My custom name` or the selected record.")
    evaluation_type = fields.Selection([
        ('value', 'Update'),
        ('equation', 'Compute')
    ], 'Value Type', default='value', change_default=True)
    resource_ref = fields.Reference(
        string='Record', selection='_selection_target_model', inverse='_set_resource_ref')
    selection_value = fields.Many2one('ir.model.fields.selection', string="Custom Value", ondelete='cascade',
                                      domain='[("field_id", "=", update_field_id)]', inverse='_set_selection_value')

    value_field_to_show = fields.Selection([
        ('value', 'value'),
        ('resource_ref', 'reference'),
        ('update_boolean_value', 'update_boolean_value'),
        ('selection_value', 'selection_value'),
    ], compute='_compute_value_field_to_show')
    # Webhook
    webhook_url = fields.Char(string='Webhook URL', help="URL to send the POST request to.")
    webhook_field_ids = fields.Many2many('ir.model.fields', 'ir_act_server_webhook_field_rel', 'server_id', 'field_id',
                                         string='Webhook Fields',
                                         help="Fields to send in the POST request. "
                                              "The id and model of the record are always sent as '_id' and '_model'. "
                                              "The name of the action that triggered the webhook is always sent as '_name'.")
    webhook_sample_payload = fields.Text(string='Sample Payload', compute='_compute_webhook_sample_payload')

    @api.constrains('webhook_field_ids')
    def _check_webhook_field_ids(self):
        """Check that the selected fields don't have group restrictions"""
        restricted_fields = dict()
        for action in self:
            Model = self.env[action.model_id.model]
            for model_field in action.webhook_field_ids:
                # you might think that the ir.model.field record holds references
                # to the groups, but that's not the case - we need to field object itself
                field = Model._fields[model_field.name]
                if field.groups:
                    restricted_fields.setdefault(action.name, []).append(model_field.field_description)
        if restricted_fields:
            restricted_field_per_action = "\n".join([f"{action}: {', '.join(f for f in fields)}" for action, fields in restricted_fields.items()])
            raise ValidationError(_("Group-restricted fields cannot be included in "
                                    "webhook payloads, as it could allow any user to "
                                    "accidentally leak sensitive information. You will "
                                    "have to remove the following fields from the webhook payload "
                                    "in the following actions:\n %s", restricted_field_per_action))

    @api.depends('state')
    def _compute_available_model_ids(self):
        allowed_models = self.env['ir.model'].search(
            [('model', 'in', list(self.env['ir.model.access']._get_allowed_models()))]
        )
        self.available_model_ids = allowed_models.ids

    @api.depends('model_id', 'update_path', 'state')
    def _compute_crud_relations(self):
        """ Compute the crud_model_id and update_field_id fields.

        The crud_model_id is the model on which the action will create or update
        records. In the case of record creation, it is the same as the main model
        of the action. For record update, it will be the model linked to the last
        field in the update_path.
        This is only used for object_create and object_write actions.
        The update_field_id is the field at the end of the update_path that will
        be updated by the action - only used for object_write actions.
        """
        for action in self:
            if action.model_id and action.state in ('object_write', 'object_create'):
                if action.state == 'object_create':
                    action.crud_model_id = action.model_id
                    action.update_field_id = False
                    action.update_path = False
                elif action.state == 'object_write':
                    if action.update_path:
                        # we need to traverse relations to find the target model and field
                        model, field, _ = action._traverse_path()
                        action.crud_model_id = model
                        action.update_field_id = field
                        need_update_model = action.evaluation_type == 'value' and action.update_field_id and action.update_field_id.relation
                        action.update_related_model_id = action.env["ir.model"]._get_id(field.relation) if need_update_model else False
                    else:
                        action.crud_model_id = action.model_id
                        action.update_field_id = False
            else:
                action.crud_model_id = False
                action.update_field_id = False
                action.update_path = False

    def _traverse_path(self, record=None):
        """ Traverse the update_path to find the target model and field, and optionally
        the target record of an action of type 'object_write'.

        :param record: optional record to use as starting point for the path traversal
        :return: a tuple (model, field, records) where model is the target model and field is the
                 target field; if no record was provided, records is None, otherwise it is the
                    recordset at the end of the path starting from the provided record
        """
        self.ensure_one()
        path = self.update_path.split('.')
        Model = self.env[self.model_id.model]
        # sanity check: we're starting from a record that belongs to the model
        if record and record._name != Model._name:
            raise ValidationError(_("I have no idea how you *did that*, but you're trying to use a gibberish configuration: the model of the record on which the action is triggered is not the same as the model of the action."))
        for field_name in path:
            is_last_field = field_name == path[-1]
            field = Model._fields[field_name]
            if field.relational and not is_last_field:
                Model = self.env[field.comodel_name]
            elif not field.relational:
                # sanity check: this should be the last field in the path
                if not is_last_field:
                    raise ValidationError(_("The path to the field to update contains a non-relational field (%s) that is not the last field in the path. You can't traverse non-relational fields (even in the quantum realm). Make sure only the last field in the path is non-relational.", field_name))
                if isinstance(field, fields.Json):
                    raise ValidationError(_("I'm sorry to say that JSON fields (such as %s) are currently not supported.", field_name))
        target_records = None
        if record is not None:
            target_records = reduce(getitem, path[:-1], record)
        model_id = self.env['ir.model']._get(Model._name)
        field_id = self.env['ir.model.fields']._get(Model._name, field_name)
        return model_id, field_id, target_records

    def _stringify_path(self):
        """ Returns a string representation of the update_path, with the field names
        separated by the `>` symbol."""
        self.ensure_one()
        path = self.update_path
        if not path:
            return ''
        model = self.env[self.model_id.model]
        pretty_path = []
        for field_name in path.split('.'):
            field = model._fields[field_name]
            field_id = self.env['ir.model.fields']._get(model._name, field_name)
            if field.relational:
                model = self.env[field.comodel_name]
            pretty_path.append(field_id.field_description)
        return ' > '.join(pretty_path)

    @api.depends('state', 'model_id', 'webhook_field_ids', 'name')
    def _compute_webhook_sample_payload(self):
        for action in self:
            if action.state != 'webhook':
                action.webhook_sample_payload = False
                continue
            payload = {
                'id': 1,
                '_model': self.model_id.model,
                '_name': action.name,
            }
            if self.model_id:
                sample_record = self.env[self.model_id.model].with_context(active_test=False).search([], limit=1)
                for field in action.webhook_field_ids:
                    if sample_record:
                        payload['id'] = sample_record.id
                        payload.update(sample_record.read(self.webhook_field_ids.mapped('name'), load=None)[0])
                    else:
                        payload[field.name] = WEBHOOK_SAMPLE_VALUES[field.ttype] if field.ttype in WEBHOOK_SAMPLE_VALUES else WEBHOOK_SAMPLE_VALUES[None]
            action.webhook_sample_payload = json.dumps(payload, indent=4, sort_keys=True, default=str)

    @api.depends('model_id')
    def _compute_link_field_id(self):
        invalid = self.filtered(lambda act: act.link_field_id.model_id != act.model_id)
        if invalid:
            invalid.link_field_id = False

    @api.constrains('code')
    def _check_python_code(self):
        for action in self.sudo().filtered('code'):
            msg = test_python_expr(expr=action.code.strip(), mode="exec")
            if msg:
                raise ValidationError(msg)

    @api.constrains('child_ids')
    def _check_child_recursion(self):
        if self._has_cycle('child_ids'):
            raise ValidationError(_('Recursion found in child server actions'))

    def _get_readable_fields(self):
        return super()._get_readable_fields() | {
            "groups_id", "model_name",
        }

    def _get_runner(self):
        multi = True
        t = self.env.registry[self._name]
        fn = getattr(t, f'_run_action_{self.state}_multi', None)\
          or getattr(t, f'run_action_{self.state}_multi', None)
        if not fn:
            multi = False
            fn = getattr(t, f'_run_action_{self.state}', None)\
              or getattr(t, f'run_action_{self.state}', None)
        if fn and fn.__name__.startswith('run_action_'):
            fn = partial(fn, self)
        return fn, multi

    def _register_hook(self):
        super()._register_hook()

        for cls in self.env.registry[self._name].mro():
            for symbol in vars(cls).keys():
                if symbol.startswith('run_action_'):
                    _logger.warning(
                        "RPC-public action methods are deprecated, found %r (in class %s.%s)",
                        symbol, cls.__module__, cls.__name__
                    )

    def create_action(self):
        """ Create a contextual action for each server action. """
        for action in self:
            action.write({'binding_model_id': action.model_id.id,
                          'binding_type': 'action'})
        return True

    def unlink_action(self):
        """ Remove the contextual actions created for the server actions. """
        self.check_access('write')
        self.filtered('binding_model_id').write({'binding_model_id': False})
        return True

    def _run_action_code_multi(self, eval_context):
        safe_eval(self.code.strip(), eval_context, mode="exec", nocopy=True, filename=str(self))  # nocopy allows to return 'action'
        return eval_context.get('action')

    def _run_action_multi(self, eval_context=None):
        res = False
        for act in self.child_ids.sorted():
            res = act.run() or res
        return res

    def _run_action_object_write(self, eval_context=None):
        """Apply specified write changes to active_id."""
        vals = self._eval_value(eval_context=eval_context)
        res = {action.update_field_id.name: vals[action.id] for action in self}

        if self._context.get('onchange_self'):
            record_cached = self._context['onchange_self']
            for field, new_value in res.items():
                record_cached[field] = new_value
        else:
            starting_record = self.env[self.model_id.model].browse(self._context.get('active_id'))
            _, _, target_records = self._traverse_path(record=starting_record)
            target_records.write(res)

    def _run_action_webhook(self, eval_context=None):
        """Send a post request with a read of the selected field on active_id."""
        record = self.env[self.model_id.model].browse(self._context.get('active_id'))
        url = self.webhook_url
        if not record:
            return
        if not url:
            raise UserError(_("I'll be happy to send a webhook for you, but you really need to give me a URL to reach out to..."))
        vals = {
            '_model': self.model_id.model,
            '_id': record.id,
            '_action': f'{self.name}(#{self.id})',
        }
        if self.webhook_field_ids:
            # you might think we could use the default json serializer of the requests library
            # but it will fail on many fields, e.g. datetime, date or binary
            # so we use the json.dumps serializer instead with the str() function as default
            vals.update(record.read(self.webhook_field_ids.mapped('name'), load=None)[0])
        json_values = json.dumps(vals, sort_keys=True, default=str)
        _logger.info("Webhook call to %s", url)
        _logger.debug("POST JSON data for webhook call: %s", json_values)
        try:
            # 'send and forget' strategy, and avoid locking the user if the webhook
            # is slow or non-functional (we still allow for a 1s timeout so that
            # if we get a proper error response code like 400, 404 or 500 we can log)
            response = requests.post(url, data=json_values, headers={'Content-Type': 'application/json'}, timeout=1)
            response.raise_for_status()
        except requests.exceptions.ReadTimeout:
            _logger.warning("Webhook call timed out after 1s - it may or may not have failed. "
                            "If this happens often, it may be a sign that the system you're "
                            "trying to reach is slow or non-functional.")
        except requests.exceptions.RequestException as e:
            _logger.warning("Webhook call failed: %s", e)
        except Exception as e:  # noqa: BLE001
            raise UserError(_("Wow, your webhook call failed with a really unusual error: %s", e)) from e

    def _run_action_object_create(self, eval_context=None):
        """Create specified model object with specified name contained in value.

        If applicable, link active_id.<self.link_field_id> to the new record.
        """
        res_id, _res_name = self.env[self.crud_model_id.model].name_create(self.value)

        if self.link_field_id:
            record = self.env[self.model_id.model].browse(self._context.get('active_id'))
            if self.link_field_id.ttype in ['one2many', 'many2many']:
                record.write({self.link_field_id.name: [Command.link(res_id)]})
            else:
                record.write({self.link_field_id.name: res_id})

    def _get_eval_context(self, action=None):
        """ Prepare the context used when evaluating python code, like the
        python formulas or code server actions.

        :param action: the current server action
        :type action: browse record
        :returns: dict -- evaluation context given to (safe_)safe_eval """
        def log(message, level="info"):
            with self.pool.cursor() as cr:
                cr.execute("""
                    INSERT INTO ir_logging(create_date, create_uid, type, dbname, name, level, message, path, line, func)
                    VALUES (NOW() at time zone 'UTC', %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (self.env.uid, 'server', self._cr.dbname, __name__, level, message, "action", action.id, action.name))

        eval_context = super(IrActionsServer, self)._get_eval_context(action=action)
        model_name = action.model_id.sudo().model
        model = self.env[model_name]
        record = None
        records = None
        if self._context.get('active_model') == model_name and self._context.get('active_id'):
            record = model.browse(self._context['active_id'])
        if self._context.get('active_model') == model_name and self._context.get('active_ids'):
            records = model.browse(self._context['active_ids'])
        if self._context.get('onchange_self'):
            record = self._context['onchange_self']
        eval_context.update({
            # orm
            'env': self.env,
            'model': model,
            # Exceptions
            'UserError': UserError,
            # record
            'record': record,
            'records': records,
            # helpers
            'log': log,
            '_logger': LoggerProxy,
        })
        return eval_context

    def run(self):
        """ Runs the server action. For each server action, the
        :samp:`_run_action_{TYPE}[_multi]` method is called. This allows easy
        overriding of the server actions.

        The ``_multi`` suffix means the runner can operate on multiple records,
        otherwise if there are multiple records the runner will be called once
        for each.

        The call context should contain the following keys:

        active_id
            id of the current object (single mode)
        active_model
            current model that should equal the action's model
        active_ids (optional)
           ids of the current records (mass mode). If ``active_ids`` and
           ``active_id`` are present, ``active_ids`` is given precedence.
        :return: an ``action_id`` to be executed, or ``False`` is finished
                 correctly without return action
        """
        res = False
        for action in self.sudo():
            action_groups = action.groups_id
            if action_groups:
                if not (action_groups & self.env.user.groups_id):
                    raise AccessError(_("You don't have enough access rights to run this action."))
            else:
                model_name = action.model_id.model
                try:
                    self.env[model_name].check_access("write")
                except AccessError:
                    _logger.warning("Forbidden server action %r executed while the user %s does not have access to %s.",
                        action.name, self.env.user.login, model_name,
                    )
                    raise

            eval_context = self._get_eval_context(action)
            records = eval_context.get('record') or eval_context['model']
            records |= eval_context.get('records') or eval_context['model']
            if not action_groups and records.ids:
                # check access rules on real records only; base automations of
                # type 'onchange' can run server actions on new records
                try:
                    records.check_access('write')
                except AccessError:
                    _logger.warning("Forbidden server action %r executed while the user %s does not have access to %s.",
                        action.name, self.env.user.login, records,
                    )
                    raise

            runner, multi = action._get_runner()
            if runner and multi:
                # call the multi method
                run_self = action.with_context(eval_context['env'].context)
                res = runner(run_self, eval_context=eval_context)
            elif runner:
                active_id = self._context.get('active_id')
                if not active_id and self._context.get('onchange_self'):
                    active_id = self._context['onchange_self']._origin.id
                    if not active_id:  # onchange on new record
                        res = runner(action, eval_context=eval_context)
                active_ids = self._context.get('active_ids', [active_id] if active_id else [])
                for active_id in active_ids:
                    # run context dedicated to a particular active_id
                    run_self = action.with_context(active_ids=[active_id], active_id=active_id)
                    eval_context["env"].context = run_self._context
                    res = runner(run_self, eval_context=eval_context)
            else:
                _logger.warning(
                    "Found no way to execute server action %r of type %r, ignoring it. "
                    "Verify that the type is correct or add a method called "
                    "`_run_action_<type>` or `_run_action_<type>_multi`.",
                    action.name, action.state
                )
        return res or False

    @api.depends('evaluation_type', 'update_field_id')
    def _compute_value_field_to_show(self):  # check if value_field_to_show can be removed and use ttype in xml view instead
        for action in self:
            if action.update_field_id.ttype in ('many2one', 'many2many'):
                action.value_field_to_show = 'resource_ref'
            elif action.update_field_id.ttype == 'selection':
                action.value_field_to_show = 'selection_value'
            elif action.update_field_id.ttype == 'boolean':
                action.value_field_to_show = 'update_boolean_value'
            else:
                action.value_field_to_show = 'value'

    @api.model
    def _selection_target_model(self):
        return [(model.model, model.name) for model in self.env['ir.model'].sudo().search([])]

    @api.constrains('update_field_id', 'evaluation_type')
    def _raise_many2many_error(self):
        if self.filtered(lambda line: line.update_field_id.ttype == 'many2many' and line.evaluation_type == 'reference'):
            raise ValidationError(_('many2many fields cannot be evaluated by reference'))

    @api.onchange('resource_ref')
    def _set_resource_ref(self):
        for action in self.filtered(lambda action: action.value_field_to_show == 'resource_ref'):
            if action.resource_ref:
                action.value = str(action.resource_ref.id)

    @api.onchange('selection_value')
    def _set_selection_value(self):
        for action in self.filtered(lambda action: action.value_field_to_show == 'selection_value'):
            if action.selection_value:
                action.value = action.selection_value.value

    def _eval_value(self, eval_context=None):
        result = {}
        for action in self:
            expr = action.value
            if action.evaluation_type == 'equation':
                expr = safe_eval(action.value, eval_context)
            elif action.update_field_id.ttype == 'many2many':
                operation = action.update_m2m_operation
                if operation == 'add':
                    expr = [Command.link(int(action.value))]
                elif operation == 'remove':
                    expr = [Command.unlink(int(action.value))]
                elif operation == 'set':
                    expr = [Command.set([int(action.value)])]
                elif operation == 'clear':
                    expr = [Command.clear()]
            elif action.update_field_id.ttype == 'boolean':
                expr = action.update_boolean_value == 'true'
            elif action.update_field_id.ttype in ['many2one', 'integer']:
                try:
                    expr = int(action.value)
                    if expr == 0 and action.update_field_id.ttype == 'many2one':
                        expr = False
                except Exception:
                    pass
            elif action.update_field_id.ttype == 'float':
                with contextlib.suppress(Exception):
                    expr = float(action.value)
            result[action.id] = expr
        return result
