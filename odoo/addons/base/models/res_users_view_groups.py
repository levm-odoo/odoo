from odoo import api, fields, models


#----------------------------------------------------------
# transient model for user view configuration
#----------------------------------------------------------


class ResGroups(models.Model):
    _inherit = 'res.groups'
    _order = 'category_id,sequence,name'

    sequence = fields.Integer(string='Sequence')
    visible = fields.Boolean(related='category_id.visible', readonly=True)
    color = fields.Integer(string='Color Index', compute='_compute_level', store=True)
    view_group_implied_ids = fields.Many2many('res.groups', compute='_compute_view_group_implied_ids')
    view_show_technical_groups = fields.Boolean(string="Show technical groups", store=False)
    view_choose_group_id = fields.Many2one('res.groups', default=lambda self: self, store=False, domain='[("category_id", "=", category_id)]')
    view_group_comment = fields.Text(string="Group comment", store=False, readonly=True, default=lambda self: self.comment)

    def _compute_level(self):
        self.color = 0
        for group in self.filtered('category_id'):
            groups = group.category_id.group_ids
            sorted_groups = groups.sorted(lambda g: (g.sequence, len(g.all_implied_by_ids & groups)))
            group.color = sorted_groups.ids.index(group._origin.id) + 1

    @api.onchange('view_choose_group_id')
    def _onchange_view_choose_group_id(self):
        self.view_group_comment = self.view_choose_group_id.comment

    @api.depends('view_show_technical_groups', 'view_choose_group_id')
    def _compute_view_group_implied_ids(self):
        group = self.view_choose_group_id or self
        if not self.view_show_technical_groups:
            self.view_group_implied_ids = group.implied_ids.filtered(lambda g: g.category_id.visible)
        else:
            self.view_group_implied_ids = group.implied_ids

    def _compute_display_name(self):
        if not self.env.context.get('view_user_settings'):
            return super()._compute_display_name()

        if self.env.context.get('view_user_settings') == 2:
            for item in self:
                item.display_name = item.name
        else:
            for item in self:
                item.display_name = f'{item.category_id.name}: {item.name}'

    @api.model
    def name_search(self, name='', args=None, operator='ilike', limit=100):
        if self.env.context.get('view_user_settings') == 2:
            return self._name_search_application_level(name=name, operator=operator, limit=limit)
        if self.env.context.get('view_user_settings'):
            return self._name_search_application(name=name, operator=operator, limit=limit)
        return super().name_search(name=name, args=args, operator=operator, limit=limit)

    @api.model
    def _name_search_application_level(self, name='', operator='ilike', limit=100):
        domain = [('category_id', '=', self.env.context.get('category_id', -1)), ('name', operator, name)]
        records = self.env['res.groups'].search(domain, order="category_id, sequence desc, name asc")
        sorted_groups = records.sorted('color')
        return [(group.id, group.name) for group in sorted_groups]

    @api.model
    def _name_search_application(self, name='', operator='ilike', limit=100):
        blacklist_ids = self.env.context['view_category_ids']
        domain = [('category_id', 'any', [('id', 'not in', blacklist_ids), ('visible', '=', True), ('name', operator, name)])]
        records = self.env['res.groups'].search(domain, order="category_id, sequence desc, name asc")
        sorted_groups = records.sorted('color')
        categories = set()

        return [(group.id, group.category_id.name)
                for group in sorted_groups
                if group.category_id not in categories and not categories.add(group.category_id)]

# pylint: disable=E0102
class ResUsers(models.Model):  # noqa: F811
    _inherit = 'res.users'

    # field view_group_selection_ids

    view_group_user_id = fields.Integer(default=lambda self: self.env['res.groups']._get_group_definitions().get_id('base.group_user'), store=False)
    view_group_selection_ids = fields.Many2many('res.groups', string='Application Groups',
                compute='_compute_view_group_ids')
    view_category_ids = fields.Many2many('ir.module.category',
                compute='_compute_view_group_ids')
    view_group_extra_ids = fields.Many2many('res.groups',
                compute='_compute_view_group_ids',
                domain=lambda self: [('category_id', 'in', [
                    False,
                    self.env.ref('base.module_category_hidden', raise_if_not_found=False).id,
                    self.env.ref('base.module_category_usability', raise_if_not_found=False).id,
                ])])
    view_group_type_user = fields.Selection(
                compute='_compute_view_group_ids',
                selection=lambda self: self._get_view_group_type_user_selection(),
                help="""Helps you manage users.
                        Portal: Portal members have specific access rights (such as record rules and restricted menus). They usually do not belong to the usual Odoo groups.
                        Public: Public users have specific access rights (such as record rules and restricted menus). They usually do not belong to the usual Odoo groups.""")

    def _get_view_group_selection_ids(self):
        self.ensure_one()
        module_category_user_type = self.env.ref('base.module_category_user_type', raise_if_not_found=False)
        module_category_hidden = self.env.ref('base.module_category_hidden', raise_if_not_found=False)
        module_category_usability = self.env.ref('base.module_category_usability', raise_if_not_found=False)
        category_extra = module_category_hidden + module_category_usability + module_category_user_type
        return self.group_ids.filtered(lambda g: g.category_id and g.category_id not in category_extra)

    def _get_view_group_extra_ids(self):
        self.ensure_one()
        module_category_hidden = self.env.ref('base.module_category_hidden', raise_if_not_found=False)
        module_category_usability = self.env.ref('base.module_category_usability', raise_if_not_found=False)
        category_extra = module_category_hidden + module_category_usability
        return self.group_ids.filtered(lambda g: not g.category_id or g.category_id in category_extra)

    def _get_view_group_type_user(self):
        self.ensure_one()
        module_category_user_type = self.env.ref('base.module_category_user_type', raise_if_not_found=False)
        # from direct groups
        groups = self.group_ids.filtered(lambda g: g.category_id == module_category_user_type)
        if not groups:
            # from implied groups
            groups = self.all_group_ids.filtered(lambda g: g.category_id == module_category_user_type)
        if not groups:
            return self.env['res.groups'].search([('category_id', '=', module_category_user_type.id)], limit=1)
        return groups[0]

    def _get_view_group_type_user_selection(self):
        module_category_user_type = self.env['ir.model.data']._xmlid_to_res_id('base.module_category_user_type', raise_if_not_found=False)
        user_type_groups = self.env['res.groups'].search([('category_id', '=', module_category_user_type)])
        return [(g.id, g.name) for g in user_type_groups]

    @api.depends('group_ids', 'all_group_ids')
    def _compute_view_group_ids(self):
        categories = (self.env.ref('base.module_category_user_type', raise_if_not_found=False) +
            self.env.ref('base.module_category_hidden', raise_if_not_found=False) +
            self.env.ref('base.module_category_usability', raise_if_not_found=False))

        for user in self:
            user.view_group_selection_ids = user._get_view_group_selection_ids()
            user.view_category_ids = user.view_group_selection_ids.category_id + categories
            user.view_group_extra_ids = user._get_view_group_extra_ids()
            user.view_group_type_user = user._get_view_group_type_user().id

    @api.onchange('view_group_selection_ids', 'view_group_extra_ids', 'view_group_type_user', 'company_ids')
    def _onchange_view_group_ids(self):
        onchange_field_names = self.env.context.get('onchange_field_names')
        if not onchange_field_names:
            return

        old_groups = groups = self.group_ids

        if 'view_group_selection_ids' in onchange_field_names:
            view_group_selection_ids = self.view_group_selection_ids
            groups = self.group_ids - self._get_view_group_selection_ids() + view_group_selection_ids

        if 'view_group_extra_ids' in onchange_field_names:
            view_group_extra_ids = self.view_group_extra_ids
            groups = self.group_ids - self._get_view_group_extra_ids() + view_group_extra_ids

        if 'view_group_type_user' in onchange_field_names:
            view_group_type_user = self.view_group_type_user
            old_type_user = self._get_view_group_type_user()
            if view_group_type_user is not False and old_type_user.id != view_group_type_user:
                # clear all groups when user choose a type
                groups = self.env['res.groups'].browse(view_group_type_user)

        if 'company_ids' in onchange_field_names:
            group_multi_company_id = self.env.ref('base.group_multi_company', raise_if_not_found=False)
            if not self.company_ids:
                self.company_ids = self.env.company
            if len(self.company_ids) > 1:
                groups += group_multi_company_id
            else:
                groups = groups.filtered(lambda g: g._origin.id != group_multi_company_id.id)
                self.company_id = self.company_ids[0]

        if old_groups == groups:
            return

        self.invalidate_recordset(['group_ids', 'all_group_ids', 'view_group_selection_ids', 'view_group_extra_ids', 'view_group_type_user'])

        self.group_ids = groups

        if 'view_group_selection_ids' in onchange_field_names:
            self.view_group_selection_ids = view_group_selection_ids
        if 'view_group_extra_ids' in onchange_field_names:
            self.view_group_extra_ids = view_group_extra_ids
        if 'view_group_type_user' in onchange_field_names:
            self.view_group_type_user = view_group_type_user

    def onchange(self, values, field_names, fields_spec):
        special_onchange_fields = {'company_ids', 'view_group_type_user', 'view_group_extra_ids', 'view_group_selection_ids'}
        if 'view_user_settings' in self.env.context and set(field_names) & special_onchange_fields:
            self_context = self.with_context(onchange_field_names=field_names)
            res = super(ResUsers, self_context).onchange(values, field_names, fields_spec)

            if 'view_group_type_user' in field_names or res['value'].get('view_group_type_user') is False:
                # Computes/onchanges sometimes have bugs/invalidation
                res['value']['view_group_type_user'] = values.get('view_group_type_user') or self_context.view_group_type_user
            return res
        return super().onchange(values, field_names, fields_spec)

    # fields to display implied group information

    view_disjoint_group_ids = fields.Many2many('res.groups', compute='_compute_view_implied_group_ids', string="Disjoint groups")
    view_all_disjoint_group_ids = fields.Many2many('res.groups', compute='_compute_view_implied_group_ids', string="All disjoint groups")
    view_visible_implied_group_ids = fields.Many2many('res.groups', compute='_compute_view_implied_group_ids', string="Groups added automatically")
    view_show_technical_groups = fields.Boolean(string="Show technical groups", store=False)

    @api.depends('group_ids', 'view_show_technical_groups')
    def _compute_view_implied_group_ids(self):
        self.view_disjoint_group_ids = False
        self.view_all_disjoint_group_ids = False
        self.view_visible_implied_group_ids = False

        group_definitions = self.env['res.groups']._get_group_definitions()

        for user in self:
            view_disjoint_group_ids = user.group_ids.disjoint_ids
            view_all_disjoint_group_ids = list(group_definitions.get_disjoint_ids(user.all_group_ids.ids))
            view_visible_implied_group_ids = user.group_ids.implied_ids.all_implied_ids
            if not user.view_show_technical_groups:
                view_visible_implied_group_ids = view_visible_implied_group_ids.filtered(lambda g: g.category_id.visible)

            user.view_disjoint_group_ids = view_disjoint_group_ids
            user.view_all_disjoint_group_ids = view_all_disjoint_group_ids
            user.view_visible_implied_group_ids = view_visible_implied_group_ids
