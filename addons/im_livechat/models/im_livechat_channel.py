# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta
import random
import re

from odoo import api, Command, fields, models, _
from odoo.addons.bus.websocket import WebsocketConnectionHandler


class Im_LivechatChannel(models.Model):
    """ Livechat Channel
        Define a communication channel, which can be accessed with 'script_external' (script tag to put on
        external website), 'script_internal' (code to be integrated with odoo website) or via 'web_page' link.
        It provides rating tools, and access rules for anonymous people.
    """

    _name = 'im_livechat.channel'
    _inherit = ['rating.parent.mixin']
    _description = 'Livechat Channel'
    _rating_satisfaction_days = 14  # include only last 14 days to compute satisfaction

    def _default_user_ids(self):
        return [(6, 0, [self._uid])]

    def _default_button_text(self):
        return _('Have a Question? Chat with us.')

    def _default_default_message(self):
        return _('How may I help you?')

    # attribute fields
    name = fields.Char('Channel Name', required=True)
    button_text = fields.Char('Text of the Button', default=_default_button_text,
        help="Default text displayed on the Livechat Support Button", translate=True)
    default_message = fields.Char('Welcome Message', default=_default_default_message,
        help="This is an automated 'welcome' message that your visitor will see when they initiate a new conversation.", translate=True)
    input_placeholder = fields.Char('Chat Input Placeholder', help='Text that prompts the user to initiate the chat.', translate=True)
    header_background_color = fields.Char(default="#875A7B", help="Default background color of the channel header once open")
    title_color = fields.Char(default="#FFFFFF", help="Default title color of the channel once open")
    button_background_color = fields.Char(default="#875A7B", help="Default background color of the Livechat button")
    button_text_color = fields.Char(default="#FFFFFF", help="Default text color of the Livechat button")
    max_sessions_mode = fields.Selection(
        [("unlimited", "Unlimited"), ("limited", "Limited")],
        default="unlimited",
        string="Sessions per Operator",
        help="If limited, operators will only handle the selected number of sessions at a time. While on a call, they will not receive new conversations.",
    )
    max_sessions = fields.Integer(
        default=10,
        string="Maximum Sessions",
        help="Maximum number of concurrent sessions per operator.",
    )

    # computed fields
    web_page = fields.Char('Web Page', compute='_compute_web_page_link', store=False, readonly=True,
        help="URL to a static page where you client can discuss with the operator of the channel.")
    are_you_inside = fields.Boolean(string='Are you inside the matrix?',
        compute='_are_you_inside', store=False, readonly=True)
    available_operator_ids = fields.Many2many('res.users', compute='_compute_available_operator_ids')
    script_external = fields.Html('Script (external)', compute='_compute_script_external', store=False, readonly=True, sanitize=False)
    nbr_channel = fields.Integer('Number of conversation', compute='_compute_nbr_channel', store=False, readonly=True)

    image_128 = fields.Image("Image", max_width=128, max_height=128)

    # relationnal fields
    user_ids = fields.Many2many('res.users', 'im_livechat_channel_im_user', 'channel_id', 'user_id', string='Operators', default=_default_user_ids)
    channel_ids = fields.One2many('discuss.channel', 'livechat_channel_id', 'Sessions')
    chatbot_script_count = fields.Integer(string='Number of Chatbot', compute='_compute_chatbot_script_count')
    rule_ids = fields.One2many('im_livechat.channel.rule', 'channel_id', 'Rules')

    _max_sessions_mode_greater_than_zero = models.Constraint(
        "CHECK(max_sessions > 0)", "Concurrent session number should be greater than zero."
    )

    def _are_you_inside(self):
        for channel in self:
            channel.are_you_inside = self.env.user in channel.user_ids

    @api.depends(
        "user_ids.channel_ids.last_interest_dt",
        "user_ids.channel_ids.livechat_active",
        "user_ids.channel_ids.livechat_channel_id",
        "user_ids.channel_ids.livechat_operator_id",
        "user_ids.im_status",
        "user_ids.is_in_call",
        "user_ids.partner_id",
    )
    def _compute_available_operator_ids(self):
        operators_by_livechat_channel = self._get_available_operators_by_livechat_channel()
        for livechat_channel in self:
            livechat_channel.available_operator_ids = operators_by_livechat_channel[livechat_channel]

    def _get_available_operators_by_livechat_channel(self, users=None):
        """Return a dictionary mapping each livechat channel in self to the users that are available
        for that livechat channel, according to the user status and the optional limit of concurrent
        sessions of the livechat channel.
        When users are provided, each user is attempted to be mapped for each livechat channel.
        Otherwise, only the users of each respective livechat channel are considered.
        """
        counts = {}
        if livechat_channels := self.filtered(lambda c: c.max_sessions_mode == "limited"):
            possible_users = users if users is not None else livechat_channels.user_ids
            limited_users = possible_users.filtered(lambda user: "online" in user.im_status)
            counts = dict(
                ((partner, livechat_channels), count)
                for (partner, livechat_channels, count) in self.env["discuss.channel"]._read_group(
                    [
                        ("livechat_operator_id", "in", limited_users.partner_id.ids),
                        ("livechat_active", "=", True),
                        ("last_interest_dt", ">=", fields.Datetime.now() - timedelta(minutes=15)),
                    ],
                    groupby=["livechat_operator_id", "livechat_channel_id"],
                    aggregates=["__count"],
                )
            )

        def is_available(user, livechat_channel):
            partner = user.partner_id
            return "online" in user.im_status and (
                livechat_channel.max_sessions_mode == "unlimited"
                or (
                    counts.get((partner, livechat_channel), 0) < livechat_channel.max_sessions
                    # sudo: res.users - it's acceptable to check if the user is in call
                    and not user.sudo().is_in_call
                )
            )
        operators_by_livechat_channel = {}
        for livechat_channel in self:
            possible_users = users if users is not None else livechat_channel.user_ids
            operators_by_livechat_channel[livechat_channel] = possible_users.filtered(
                lambda user, livechat_channel=livechat_channel: is_available(user, livechat_channel)
            )
        return operators_by_livechat_channel

    @api.depends('rule_ids.chatbot_script_id')
    def _compute_chatbot_script_count(self):
        data = self.env['im_livechat.channel.rule']._read_group(
            [('channel_id', 'in', self.ids)], ['channel_id'], ['chatbot_script_id:count_distinct'])
        mapped_data = {channel.id: count_distinct for channel, count_distinct in data}
        for channel in self:
            channel.chatbot_script_count = mapped_data.get(channel.id, 0)

    def _compute_script_external(self):
        values = {
            "dbname": self._cr.dbname,
        }
        for record in self:
            values["channel_id"] = record.id
            values["url"] = record.get_base_url()
            record.script_external = self.env['ir.qweb']._render('im_livechat.external_loader', values) if record.id else False

    def _compute_web_page_link(self):
        for record in self:
            record.web_page = "%s/im_livechat/support/%i" % (record.get_base_url(), record.id) if record.id else False

    @api.depends('channel_ids')
    def _compute_nbr_channel(self):
        data = self.env['discuss.channel']._read_group([
            ('livechat_channel_id', 'in', self.ids),
        ], ['livechat_channel_id'], ['__count'])
        channel_count = {livechat_channel.id: count for livechat_channel, count in data}
        for record in self:
            record.nbr_channel = channel_count.get(record.id, 0)

    # --------------------------
    # Action Methods
    # --------------------------
    def action_join(self):
        self.ensure_one()
        self.user_ids = [Command.link(self.env.user.id)]
        self.env.user._bus_send_store(self, ["are_you_inside", "name"])

    def action_quit(self):
        self.ensure_one()
        self.user_ids = [Command.unlink(self.env.user.id)]
        self.env.user._bus_send_store(self, ["are_you_inside", "name"])

    def action_view_rating(self):
        """ Action to display the rating relative to the channel, so all rating of the
            sessions of the current channel
            :returns : the ir.action 'action_view_rating' with the correct context
        """
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('im_livechat.rating_rating_action_livechat')
        action['context'] = {'search_default_parent_res_name': self.name}
        return action

    def action_view_chatbot_scripts(self):
        action = self.env['ir.actions.act_window']._for_xml_id('im_livechat.chatbot_script_action')
        chatbot_script_ids = self.env['im_livechat.channel.rule'].search(
            [('channel_id', 'in', self.ids)]).mapped('chatbot_script_id')
        if len(chatbot_script_ids) == 1:
            action['res_id'] = chatbot_script_ids.id
            action['view_mode'] = 'form'
            action['views'] = [(False, 'form')]
        else:
            action['domain'] = [('id', 'in', chatbot_script_ids.ids)]
        return action

    # --------------------------
    # Channel Methods
    # --------------------------
    def _get_livechat_discuss_channel_vals(
        self, anonymous_name, previous_operator_id=None, chatbot_script=None, user_id=None, country_id=None, lang=None
    ):
        user_operator = False
        if chatbot_script:
            if chatbot_script.id not in self.browse(self.ids).mapped('rule_ids.chatbot_script_id.id'):
                return False
        else:
            user_operator = self._get_operator(previous_operator_id=previous_operator_id, lang=lang, country_id=country_id)
            if not user_operator:
                # no one available
                return False
        # partner to add to the discuss.channel
        operator_partner_id = user_operator.partner_id.id if user_operator else chatbot_script.operator_partner_id.id
        members_to_add = [
            Command.create({
                # making sure the unpin_dt is always later than the last_interest_dt
                # so that the channel is always unpinned at first
                'last_interest_dt': fields.Datetime.now() - timedelta(seconds=30),
                'partner_id': operator_partner_id,
                'unpin_dt': fields.Datetime.now(),
            })
        ]
        visitor_user = False
        if user_id:
            visitor_user = self.env['res.users'].browse(user_id)
            if visitor_user and visitor_user.active and user_operator and visitor_user != user_operator:  # valid session user (not public)
                members_to_add.append(Command.create({'partner_id': visitor_user.partner_id.id}))

        if chatbot_script:
            name = chatbot_script.title
        else:
            name = ' '.join([
                visitor_user.display_name if visitor_user else anonymous_name,
                user_operator.livechat_username or user_operator.name
            ])

        return {
            'channel_member_ids': members_to_add,
            'livechat_active': True,
            'livechat_operator_id': operator_partner_id,
            'livechat_channel_id': self.id,
            'chatbot_current_step_id': chatbot_script._get_welcome_steps()[-1].id if chatbot_script else False,
            'anonymous_name': False if user_id else anonymous_name,
            'country_id': country_id,
            'channel_type': 'livechat',
            'name': name,
        }

    def _get_less_active_operator(self, operator_statuses, operators):
        """ Retrieve the most available operator based on the following criteria:
        - Lowest number of active chats.
        - Not in  a call.
        - If an operator is in a call and has two or more active chats, don't
          give priority over an operator with more conversations who is not in a
          call.

        :param operator_statuses: list of dictionaries containing the operator's
            id, the number of active chats and a boolean indicating if the
            operator is in a call. The list is ordered by the number of active
            chats (ascending) and whether the operator is in a call
            (descending).
        :param operators: recordset of :class:`ResUsers` operators to choose from.
        :return: the :class:`ResUsers` record for the chosen operator
        """
        if not operators:
            return False

        # 1) only consider operators in the list to choose from
        operator_statuses = [
            s for s in operator_statuses if s['livechat_operator_id'] in set(operators.partner_id.ids)
        ]

        # 2) try to select an inactive op, i.e. one w/ no active status (no recent chat)
        active_op_partner_ids = {s['livechat_operator_id'] for s in operator_statuses}
        candidates = operators.filtered(lambda o: o.partner_id.id not in active_op_partner_ids)
        if candidates:
            return random.choice(candidates)

        # 3) otherwise select least active ops, based on status ordering (count + in_call)
        best_status = operator_statuses[0]
        best_status_op_partner_ids = {
            s['livechat_operator_id']
            for s in operator_statuses
            if (s['count'], s['in_call']) == (best_status['count'], best_status['in_call'])
        }
        candidates = operators.filtered(lambda o: o.partner_id.id in best_status_op_partner_ids)
        return random.choice(candidates)

    def _get_operator(
        self, previous_operator_id=None, lang=None, country_id=None, expertises=None, users=None
    ):
        """ Return an operator for a livechat. Try to return the previous
        operator if available. If not, one of the most available operators be
        returned.

        A livechat is considered 'active' if it has at least one message within
        the 30 minutes. This method will try to match the given lang, expertises
        and country_id.

        (Some annoying conversions have to be made on the fly because this model
        holds 'res.users' as available operators and the discuss_channel model
        stores the partner_id of the randomly selected operator)

        :param previous_operator_id: partner id of the previous operator with
            whom the visitor was chatting.
        :param lang: code of the preferred lang of the visitor.
        :param country_id: id of the country of the visitor.
        :param expertises: preferred expertises for filtering operators.
        :param users: recordset of available users to use as candidates instead
            of the users of the livechat channel.
        :return : user
        :rtype : res.users
        """
        self.ensure_one()
        users = users if users is not None else self.available_operator_ids
        if not users:
            return self.env["res.users"]
        if expertises is None:
            expertises = self.env["im_livechat.expertise"]
        # FIXME: remove inactive call sessions so operators no longer in call are available
        # sudo: required to use garbage collecting function.
        self.env["discuss.channel.rtc.session"].sudo()._gc_inactive_sessions()
        self.env.cr.execute("""
            WITH operator_rtc_session AS (
                SELECT COUNT(DISTINCT s.id) as nbr, member.partner_id as partner_id
                  FROM discuss_channel_rtc_session s
                  JOIN discuss_channel_member member ON (member.id = s.channel_member_id)
                  GROUP BY member.partner_id
            )
            SELECT COUNT(DISTINCT c.id), COALESCE(rtc.nbr, 0) > 0 as in_call, c.livechat_operator_id
            FROM discuss_channel c
            LEFT OUTER JOIN mail_message m ON c.id = m.res_id AND m.model = 'discuss.channel'
            LEFT OUTER JOIN operator_rtc_session rtc ON rtc.partner_id = c.livechat_operator_id
            WHERE c.channel_type = 'livechat' AND c.create_date > ((now() at time zone 'UTC') - interval '24 hours')
            AND (
                c.livechat_active IS TRUE
                OR m.create_date > ((now() at time zone 'UTC') - interval '30 minutes')
            )
            AND c.livechat_operator_id in %s
            GROUP BY c.livechat_operator_id, rtc.nbr
            ORDER BY COUNT(DISTINCT c.id) < 2 OR rtc.nbr IS NULL DESC, COUNT(DISTINCT c.id) ASC, rtc.nbr IS NULL DESC""",
            (tuple(users.partner_id.ids),)
        )
        operator_statuses = self.env.cr.dictfetchall()
        # Try to match the previous operator
        if previous_operator_id in users.partner_id.ids:
            previous_operator_status = next(
                (status for status in operator_statuses if status['livechat_operator_id'] == previous_operator_id),
                None
            )
            if not previous_operator_status or previous_operator_status['count'] < 2 or not previous_operator_status['in_call']:
                previous_operator_user = next(
                    available_user
                    for available_user in users
                    if available_user.partner_id.id == previous_operator_id
                )
                return previous_operator_user

        def same_language(operator):
            return operator.partner_id.lang == lang or lang in operator.livechat_lang_ids.mapped("code")

        def all_expertises(operator):
            return operator.livechat_expertise_ids >= expertises

        def one_expertise(operator):
            return operator.livechat_expertise_ids & expertises

        def same_country(operator):
            return operator.partner_id.country_id.id == country_id

        # List from most important to least important. Order on each line is irrelevant, all
        # elements of a line must be satisfied together or the next line is checked.
        preferences_list = [
            [same_language, all_expertises],
            [same_language, one_expertise],
            [same_language],
            [same_country, all_expertises],
            [same_country, one_expertise],
            [same_country],
            [all_expertises],
            [one_expertise],
        ]
        for preferences in preferences_list:
            operators = users
            for preference in preferences:
                operators = operators.filtered(preference)
            if operators:
                return self._get_less_active_operator(operator_statuses, operators)
        return self._get_less_active_operator(operator_statuses, users)

    def _get_channel_infos(self):
        self.ensure_one()

        return {
            'header_background_color': self.header_background_color,
            'button_background_color': self.button_background_color,
            'title_color': self.title_color,
            'button_text_color': self.button_text_color,
            'button_text': self.button_text,
            'input_placeholder': self.input_placeholder,
            'default_message': self.default_message,
            "channel_name": self.name,
            "channel_id": self.id,
        }

    def get_livechat_info(self, username=None):
        self.ensure_one()

        if username is None:
            username = _('Visitor')
        info = {}
        info['available'] = self.chatbot_script_count or len(self.available_operator_ids) > 0
        info['server_url'] = self.get_base_url()
        info["websocket_worker_version"] = WebsocketConnectionHandler._VERSION
        if info['available']:
            info['options'] = self._get_channel_infos()
            info['options']["default_username"] = username
        return info


class Im_LivechatChannelRule(models.Model):
    """ Channel Rules
        Rules defining access to the channel (countries, and url matching). It also provide the 'auto pop'
        option to open automatically the conversation.
    """

    _name = 'im_livechat.channel.rule'
    _description = 'Livechat Channel Rules'
    _order = 'sequence asc'

    regex_url = fields.Char('URL Regex',
        help="Regular expression specifying the web pages this rule will be applied on.")
    action = fields.Selection([
        ('display_button', 'Show'),
        ('display_button_and_text', 'Show with notification'),
        ('auto_popup', 'Open automatically'),
        ('hide_button', 'Hide')], string='Live Chat Button', required=True, default='display_button',
        help="* 'Show' displays the chat button on the pages.\n"\
             "* 'Show with notification' is 'Show' in addition to a floating text just next to the button.\n"\
             "* 'Open automatically' displays the button and automatically opens the conversation pane.\n"\
             "* 'Hide' hides the chat button on the pages.\n")
    auto_popup_timer = fields.Integer('Open automatically timer', default=0,
        help="Delay (in seconds) to automatically open the conversation window. Note: the selected action must be 'Open automatically' otherwise this parameter will not be taken into account.")
    chatbot_script_id = fields.Many2one('chatbot.script', string='Chatbot')
    chatbot_only_if_no_operator = fields.Boolean(
        string='Enabled only if no operator', help='Enable the bot only if there is no operator available')
    channel_id = fields.Many2one('im_livechat.channel', 'Channel',
        help="The channel of the rule")
    country_ids = fields.Many2many('res.country', 'im_livechat_channel_country_rel', 'channel_id', 'country_id', 'Country',
        help="The rule will only be applied for these countries. Example: if you select 'Belgium' and 'United States' and that you set the action to 'Hide', the chat button will be hidden on the specified URL from the visitors located in these 2 countries. This feature requires GeoIP installed on your server.")
    sequence = fields.Integer('Matching order', default=10,
        help="Given the order to find a matching rule. If 2 rules are matching for the given url/country, the one with the lowest sequence will be chosen.")

    def match_rule(self, channel_id, url, country_id=False):
        """ determine if a rule of the given channel matches with the given url
            :param channel_id : the identifier of the channel_id
            :param url : the url to match with a rule
            :param country_id : the identifier of the country
            :returns the rule that matches the given condition. False otherwise.
            :rtype : im_livechat.channel.rule
        """
        def _match(rules):
            for rule in rules:
                # url might not be set because it comes from referer, in that
                # case match the first rule with no regex_url
                if not re.search(rule.regex_url or "", url or ""):
                    continue
                if rule.chatbot_script_id and (
                    not rule.chatbot_script_id.active or not rule.chatbot_script_id.script_step_ids
                ):
                    continue
                if rule.chatbot_only_if_no_operator and rule.channel_id.available_operator_ids:
                    continue
                return rule
            return False
        # first, search the country specific rules (the first match is returned)
        if country_id: # don't include the country in the research if geoIP is not installed
            domain = [('country_ids', 'in', [country_id]), ('channel_id', '=', channel_id)]
            rule = _match(self.search(domain))
            if rule:
                return rule
        # second, fallback on the rules without country
        domain = [('country_ids', '=', False), ('channel_id', '=', channel_id)]
        return _match(self.search(domain))
