import { mailDataHelpers } from "@mail/../tests/mock_server/mail_mock_server";

import { fields, getKwArgs, makeKwArgs, webModels } from "@web/../tests/web_test_helpers";
import { Domain } from "@web/core/domain";
import { DEFAULT_MAIL_SEARCH_ID, DEFAULT_MAIL_VIEW_ID } from "./constants";

/** @typedef {import("@web/../tests/web_test_helpers").ModelRecord} ModelRecord */

export class ResPartner extends webModels.ResPartner {
    _inherit = ["mail.thread"];

    description = fields.Char({ string: "Description" });
    hasWriteAccess = fields.Boolean({ default: true });
    message_main_attachment_id = fields.Many2one({
        relation: "ir.attachment",
        string: "Main attachment",
    });

    _views = {
        [`search, ${DEFAULT_MAIL_SEARCH_ID}`]: /* xml */ `<search/>`,
        [`form,${DEFAULT_MAIL_VIEW_ID}`]: /* xml */ `
            <form>
                <sheet>
                    <field name="name"/>
                </sheet>
                <chatter/>
            </form>`,
    };

    /**
     * @param {string} [search]
     * @param {number} [limit]
     */
    get_mention_suggestions(search, limit = 8) {
        const kwargs = getKwArgs(arguments, "search", "limit");
        search = kwargs.search || "";
        limit = kwargs.limit || 8;

        /** @type {import("mock_models").ResUsers} */
        const ResUsers = this.env["res.users"];

        search = search.toLowerCase();
        /**
         * Returns the given list of partners after filtering it according to
         * the logic of the Python method `get_mention_suggestions` for the
         * given search term. The result is truncated to the given limit and
         * formatted as expected by the original method.
         *
         * @param {ModelRecord[]} partners
         * @param {string} search
         * @param {number} limit
         */
        const mentionSuggestionsFilter = (partners, search, limit) => {
            const matchingPartnerIds = partners
                .filter((partner) => {
                    // no search term is considered as return all
                    if (!search) {
                        return true;
                    }
                    // otherwise name or email must match search term
                    if (partner.name && partner.name.toLowerCase().includes(search)) {
                        return true;
                    }
                    if (partner.email && partner.email.toLowerCase().includes(search)) {
                        return true;
                    }
                    return false;
                })
                .map((partner) => partner.id);
            // reduce results to max limit
            matchingPartnerIds.length = Math.min(matchingPartnerIds.length, limit);
            return matchingPartnerIds;
        };

        // add main suggestions based on users
        const partnersFromUsers = ResUsers._filter([])
            .map((user) => this.browse(user.partner_id)[0])
            .filter((partner) => partner);
        const mainMatchingPartnerIds = mentionSuggestionsFilter(partnersFromUsers, search, limit);

        let extraMatchingPartnerIds = [];
        // if not enough results add extra suggestions based on partners
        const remainingLimit = limit - mainMatchingPartnerIds.length;
        if (mainMatchingPartnerIds.length < limit) {
            const partners = this._filter([["id", "not in", mainMatchingPartnerIds]]);
            extraMatchingPartnerIds = mentionSuggestionsFilter(partners, search, remainingLimit);
        }
        return new mailDataHelpers.Store(
            this.browse(mainMatchingPartnerIds.concat(extraMatchingPartnerIds))
        ).get_result();
    }

    /**
     * @param {number} [channel_id]
     * @param {string} [search]
     * @param {number} [limit]
     */
    get_mention_suggestions_from_channel(channel_id, search, limit = 8) {
        const kwargs = getKwArgs(arguments, "channel_id", "search", "limit");
        channel_id = kwargs.channel_id;
        search = kwargs.search || "";
        limit = kwargs.limit || 8;

        // /** @type {import("mock_models").DiscussChannelMember} */
        // const DiscussChannelMember = this.env["discuss.channel.member"];
        // /** @type {import("mock_models").ResUsers} */
        // const ResUsers = this.env["res.users"];
        // /** @type {import("mock_models").DiscussChannel} */
        // const channel = this.env["discuss.channel"].browse(channel_id)[0];

        // search = search.toLowerCase();
        // /**
        //  * Returns the given list of partners after filtering it according to
        //  * the logic of the Python method `get_mention_suggestions` for the
        //  * given search term. The result is truncated to the given limit and
        //  * formatted as expected by the original method.
        //  *
        //  * @param {ModelRecord[]} partners
        //  * @param {string} search
        //  * @param {number} limit
        //  * @returns {Object[]}
        //  */
        // const mentionSuggestionsFilter = (partners, search, limit) => {
        //     ResUsers._filter([])
        //         .filter((user) => {
        //             const [partner] = this.browse(user.partner_id);
        //             // user must have a partner
        //             if (!partner) {
        //                 return false;
        //             }
        //             // user should not already be a member of the channel
        //             if (memberPartnerIds.has(partner.id)) {
        //                 return false;
        //             }
        //             // no name is considered as return all
        //             if (!search_term) {
        //                 return true;
        //             }
        //             if (partner.name && partner.name.toLowerCase().includes(search_term)) {
        //                 return true;
        //             }
        //             return false;
        //         })
        //         .map((user) => user.partner_id);

        //     const matchingPartners = partners.filter((partner) => {
        //         // debugger
        //         // if (partner.partner_share === false && partner.user_ids !== false) {
        //         //     const [user] = ResUsers._filter([
        //         //         ["partner_id", "=", partner.id],
        //         //         ["groups_id", "in", channel.group_public_id],
        //         //         ["active", "=", true],
        //         //     ]);
        //         //     if (
        //         //         user &&
        //         //         user.groups_id.includes(channel.group_public_id) &&
        //         //         user.active === true
        //         //     ) {
        //         //         return true;
        //         //     }
        //         // }
        //         const [member] = DiscussChannelMember._filter([
        //             ["channel_id", "=", channel_id],
        //             ["partner_id", "=", partner.id],
        //         ]);
        //         if (!member) {
        //             return false;
        //         }
        //         // no search term is considered as return all
        //         if (!search) {
        //             return true;
        //         }
        //         // otherwise name or email must match search term
        //         if (partner.name && partner.name.toLowerCase().includes(search)) {
        //             return true;
        //         }
        //         if (partner.email && partner.email.toLowerCase().includes(search)) {
        //             return true;
        //         }
        //         return false;
        //     });
        //     // reduce results to max limit
        //     matchingPartners.length = Math.min(matchingPartners.length, limit);
        //     return matchingPartners;
        // };

        // // add main suggestions based on users
        // const partnersFromUsers = ResUsers._filter([])
        //     .map((user) => this.browse(user.partner_id)[0])
        //     .filter((partner) => partner);
        // const mainMatchingPartners = mentionSuggestionsFilter(partnersFromUsers, search, limit);
        // let extraMatchingPartners = [];
        // // if not enough results add extra suggestions based on partners
        // const remainingLimit = limit - mainMatchingPartners.length;
        // debugger;
        // if (mainMatchingPartners.length < limit) {
        //     const partners = this._filter([
        //         ["id", "not in", mainMatchingPartners.map((partner) => partner.id)],
        //     ]);
        //     extraMatchingPartners = mentionSuggestionsFilter(partners, search, remainingLimit);
        // }
        // const store = new mailDataHelpers.Store();
        // for (const partner of mainMatchingPartners.concat(extraMatchingPartners)) {
        //     // const [user] = ResUsers._filter([["partner_id", "=", partner.id]]);
        //     // if (user) {
        //     //     store.add(this.browse(partner.id), {
        //     //         groups_id: user?.groups_id.includes(channel.group_public_id)
        //     //             ? channel.group_public_id
        //     //             : false,
        //     //     });
        //     // } else {
        //     store.add(this.browse(partner.id));
        //     // }
        //     const [member] = DiscussChannelMember._filter([
        //         ["channel_id", "=", channel_id],
        //         ["partner_id", "=", partner.id],
        //     ]);
        //     store.add(
        //         DiscussChannelMember.browse(member.id),
        //         makeKwArgs({ fields: { channel: [], persona: [] } })
        //     );
        // }

        // let extra_domain = Domain.and([
        //     [["user_ids", "!=", false]],
        //     [["user_ids.active", "=", true]],
        //     [["partner_share", "=", false]],
        // ]);
        // // if (channel.group_public_id.id) {
        // //     extra_domain = Domain.and([
        // //         extra_domain,
        // //         [("user_ids.groups_id", "in", channel.group_public_id.id)],
        // //     ]);
        // // }
        // const partners = this.search([
        //     [["user_ids", "!=", false]],
        //     [["user_ids.active", "=", true]],
        //     [["partner_share", "=", false]],
        // ]);

        // const internalUsers = ResUsers._filter([
        //     ["user_ids", "!=", false],
        //     ["groups_id", "in", channel.group_public_id],
        //     ["active", "=", true],
        //     ["partner_share", "=", false], // Add this directly if possible
        // ]);
        // for (const user of internalUsers) {
        //     store.add(this.browse(user.partner_id), {
        //         groups_id: user.groups_id.includes(channel.group_public_id)
        //             ? channel.group_public_id
        //             : undefined,
        //     });
        // }
        // return store.get_result();
        const DiscussChannelMember = this.env["discuss.channel.member"];
        // const ResUsers = this.env["res.users"];
        const channel = this.env["discuss.channel"].browse(channel_id)[0];

        // Prepare filtering domains
        const searchLower = search.toLowerCase();
        // debugger;
        const extra_domain = new Domain([
            ["user_ids", "!=", false],
            ["active", "=", true],
            ["partner_share", "=", false],
        ]).toList();

        if (channel.group_public_id) {
            extra_domain.push(["groups_id", "in", channel.group_public_id]);
        }

        const baseDomain = search
            ? new Domain([
                  "|", // Logical OR
                  ["name", "ilike", searchLower],
                  ["email", "ilike", searchLower],
              ]).toList()
            : [];
        const partners = this._search_mention_suggestions(
            baseDomain,
            limit,
            extra_domain,
            channel_id
        );
        // Fetch and filter partners based on search criteria

        const store = new mailDataHelpers.Store();

        partners.forEach((id) => {
            // Fetch the DiscussChannelMember record for the given partner ID
            const [member] = DiscussChannelMember._filter([
                ["channel_id", "=", channel_id],
                ["partner_id", "=", id],
            ]);

            if (member) {
                // Add the partner and member to the store
                store.add(this.browse(id));
                store.add(
                    DiscussChannelMember.browse(member.id),
                    makeKwArgs({ fields: { channel: [], persona: [] } })
                );
            }
        });

        for (const p of partners) {
            const [user] = this.env["res.users"]._filter([["partner_id", "=", p]]);

            if (user) {
                // Add to the store with the appropriate group_id
                store.add(this.browse(p), {
                    groups_id: user.groups_id.includes(channel.group_public_id)
                        ? channel.group_public_id
                        : undefined,
                });
            }
        }

        // Return the final result
        return store.get_result();
    }

    _search_mention_suggestions(domain, limit, extra_domain, channel_id) {
        const ResUsers = this.env["res.users"];
        const DiscussChannelMember = this.env["discuss.channel.member"];

        let partners = [];

        // If the domain is empty or null, fetch channel members and internal users directly
        if (!domain || domain.length === 0) {
            if (channel_id) {
                const channelMembers = DiscussChannelMember._filter([
                    ["channel_id", "=", channel_id],
                ]);

                channelMembers.forEach((member) => {
                    if (!partners.includes(member.partner_id)) {
                        partners.push(member.partner_id);
                    }
                });
            }
        } else {
            // Fetch all partners matching the domain
            partners = ResUsers._filter(domain).map((user) => user.partner_id);
        }

        // Fetch internal users if extra_domain is provided
        const internalUsers = extra_domain
            ? ResUsers._filter(extra_domain)
                  .map((user) => user.partner_id)
                  .filter((partnerId) => !partners.includes(partnerId))
            : [];

        // Combine and deduplicate all partner IDs
        const uniquePartners = Array.from(new Set(partners.concat(internalUsers)));

        // Apply limit if specified
        const limitedPartners = limit ? uniquePartners.slice(0, limit) : uniquePartners;

        // Return the deduplicated list of partner IDs
        return limitedPartners;
    }

    /**
     * @param {string} [name]
     * @param {number} [limit = 20]
     * @param {number[]} [excluded_ids]
     */
    im_search(name, limit = 20, excluded_ids) {
        const kwargs = getKwArgs(arguments, "name", "limit", "excluded_ids");
        name = kwargs.name || "";
        limit = kwargs.limit || 20;
        excluded_ids = kwargs.excluded_ids || [];

        /** @type {import("mock_models").ResUsers} */
        const ResUsers = this.env["res.users"];

        name = name.toLowerCase(); // simulates ILIKE
        // simulates domain with relational parts (not supported by mock server)
        const matchingPartnersIds = ResUsers._filter([])
            .filter((user) => {
                const [partner] = this.browse(user.partner_id);
                // user must have a partner
                if (!partner) {
                    return false;
                }
                // not excluded
                if (excluded_ids.includes(partner.id)) {
                    return false;
                }
                // not current partner
                if (partner.id === this.env.user.partner_id) {
                    return false;
                }
                // no name is considered as return all
                if (!name) {
                    return true;
                }
                if (partner.name && partner.name.toLowerCase().includes(name)) {
                    return true;
                }
                return false;
            })
            .map((user) => user.partner_id)
            .sort((a, b) => (a.name === b.name ? a.id - b.id : a.name > b.name ? 1 : -1));
        matchingPartnersIds.length = Math.min(matchingPartnersIds.length, limit);
        return new mailDataHelpers.Store(this.browse(matchingPartnersIds)).get_result();
    }

    /**
     * @param {number[]} ids
     * @returns {Record<string, ModelRecord>}
     */
    _to_store(ids, store, fields) {
        const kwargs = getKwArgs(arguments, "id", "store", "fields");
        fields = kwargs.fields;
        if (!fields) {
            fields = ["name", "email", "active", "im_status", "is_company", "user", "write_date"];
        }

        /** @type {import("mock_models").ResCountry} */
        const ResCountry = this.env["res.country"];
        /** @type {import("mock_models").ResUsers} */
        const ResUsers = this.env["res.users"];

        for (const partner of this.browse(ids)) {
            const [data] = this._read_format(
                partner.id,
                fields.filter(
                    (field) =>
                        ![
                            "country",
                            "display_name",
                            "isAdmin",
                            "notification_type",
                            "user",
                        ].includes(field)
                ),
                false
            );
            if (fields.includes("country")) {
                const [country] = ResCountry.browse(partner.country_id);
                data.country = country
                    ? {
                          code: country.code,
                          id: country.id,
                          name: country.name,
                      }
                    : false;
            }
            if (fields.includes("display_name")) {
                data.displayName = partner.display_name || partner.name;
            }
            if (fields.includes("user")) {
                const users = ResUsers.browse(partner.user_ids);
                const internalUsers = users.filter((user) => !user.share);
                let mainUser;
                if (internalUsers.length > 0) {
                    mainUser = internalUsers[0];
                } else if (users.length > 0) {
                    mainUser = users[0];
                }
                data.userId = mainUser ? mainUser.id : false;
                data.isInternalUser = mainUser ? !mainUser.share : false;
                if (fields.includes("isAdmin")) {
                    data.isAdmin = true; // mock server simplification
                }
                if (fields.includes("notification_type")) {
                    data.notification_preference = mainUser.notification_type;
                }
            }
            store.add(this.browse(partner.id), data);
        }
    }

    /**
     * @param {string} [search_term]
     * @param {number} [channel_id]
     * @param {number} [limit]
     */
    search_for_channel_invite(search_term, channel_id, limit = 30) {
        const kwargs = getKwArgs(arguments, "search_term", "channel_id", "limit");
        search_term = kwargs.search_term || "";
        channel_id = kwargs.channel_id;
        limit = kwargs.limit || 30;

        /** @type {import("mock_models").DiscussChannelMember} */
        const DiscussChannelMember = this.env["discuss.channel.member"];
        /** @type {import("mock_models").ResUsers} */
        const ResUsers = this.env["res.users"];

        search_term = search_term.toLowerCase(); // simulates ILIKE
        const memberPartnerIds = new Set(
            DiscussChannelMember._filter([["channel_id", "=", channel_id]]).map(
                (member) => member.partner_id
            )
        );
        // simulates domain with relational parts (not supported by mock server)
        const matchingPartnersIds = ResUsers._filter([])
            .filter((user) => {
                const [partner] = this.browse(user.partner_id);
                // user must have a partner
                if (!partner) {
                    return false;
                }
                // user should not already be a member of the channel
                if (memberPartnerIds.has(partner.id)) {
                    return false;
                }
                // no name is considered as return all
                if (!search_term) {
                    return true;
                }
                if (partner.name && partner.name.toLowerCase().includes(search_term)) {
                    return true;
                }
                return false;
            })
            .map((user) => user.partner_id);
        const count = matchingPartnersIds.length;
        matchingPartnersIds.length = Math.min(count, limit);
        const store = new mailDataHelpers.Store();
        this._search_for_channel_invite_to_store(matchingPartnersIds, store, channel_id);
        return { count, data: store.get_result() };
    }

    _search_for_channel_invite_to_store(ids, store, channel_id) {
        store.add(this.browse(ids));
    }

    /**
     * @param {number} id
     * @returns {number}
     */
    _get_needaction_count(id) {
        /** @type {import("mock_models").MailNotification} */
        const MailNotification = this.env["mail.notification"];

        const [partner] = this.browse(id);
        return MailNotification._filter([
            ["res_partner_id", "=", partner.id],
            ["is_read", "=", false],
        ]).length;
    }

    _get_current_persona() {
        /** @type {import("mock_models").MailGuest} */
        const MailGuest = this.env["mail.guest"];
        /** @type {import("mock_models").ResUsers} */
        const ResUsers = this.env["res.users"];

        if (ResUsers._is_public(this.env.uid)) {
            return [null, MailGuest._get_guest_from_context()];
        }
        return [this.browse(this.env.user.partner_id)[0], null];
    }
}
