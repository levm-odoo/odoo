import { partnerCompareRegistry } from "@mail/core/common/partner_compare";
import { cleanTerm } from "@mail/utils/common/format";
import { toRaw } from "@odoo/owl";

import { registry } from "@web/core/registry";

export class SuggestionService {
    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {import("services").ServiceFactories} services
     */
    constructor(env, services) {
        this.env = env;
        this.orm = services.orm;
        this.store = services["mail.store"];
    }

    getSupportedDelimiters(thread) {
        return [["@"], ["#"], [":"]];
    }

    async fetchSuggestions({ delimiter, term }, { thread, signal } = {}) {
        const cleanedSearchTerm = cleanTerm(term);
        switch (delimiter) {
            case "@": {
                return this.fetchPartners(cleanedSearchTerm, thread, { signal });
            }
            case "#":
                return this.fetchThreads(cleanedSearchTerm, { signal });
            case ":":
                return this.store.cannedReponses.fetch();
        }
    }

    /**
     * Make an ORM call with a cancellable signal. Usefull to abort fetch
     * requests from the outside.
     *
     * @param {String} model
     * @param {String} method
     * @param {Array} args
     * @param {Object} kwargs
     * @param {Object} options
     * @param {AbortSignal} options.signal
     * @returns
     */
    makeOrmCall(model, method, args, kwargs, { signal } = {}) {
        return new Promise((res, rej) => {
            const req = this.orm.silent.call(model, method, args, kwargs);
            const onAbort = () => rej(req.abort());
            signal?.addEventListener("abort", onAbort);
            req.then(res)
                .catch(rej)
                .finally(() => signal?.removeEventListener("abort", onAbort));
        });
    }
    /**
     * @param {string} term
     * @param {import("models").Thread} [thread]
     */
    async fetchPartners(term, thread, { signal } = {}) {
        const kwargs = { search: term };
        if (thread?.model === "discuss.channel") {
            kwargs.channel_id = thread.id;
        }
        const data = await this.makeOrmCall(
            "res.partner",
            thread?.model === "discuss.channel"
                ? "get_mention_suggestions_from_channel"
                : "get_mention_suggestions",
            [],
            kwargs,
            { signal }
        );
        this.store.insert(data);
    }

    /**
     * @param {string} term
     */
    async fetchThreads(term, { signal } = {}) {
        const suggestedThreads = await this.makeOrmCall(
            signal,
            "discuss.channel",
            "get_mention_suggestions",
            [],
            { search: term },
            { signal }
        );
        this.store.Thread.insert(suggestedThreads);
    }

    searchCannedResponseSuggestions(cleanedSearchTerm, sort) {
        const cannedResponses = Object.values(this.store["mail.canned.response"].records).filter(
            (cannedResponse) => cleanTerm(cannedResponse.source).includes(cleanedSearchTerm)
        );
        const sortFunc = (c1, c2) => {
            const cleanedName1 = cleanTerm(c1.source);
            const cleanedName2 = cleanTerm(c2.source);
            if (
                cleanedName1.startsWith(cleanedSearchTerm) &&
                !cleanedName2.startsWith(cleanedSearchTerm)
            ) {
                return -1;
            }
            if (
                !cleanedName1.startsWith(cleanedSearchTerm) &&
                cleanedName2.startsWith(cleanedSearchTerm)
            ) {
                return 1;
            }
            if (cleanedName1 < cleanedName2) {
                return -1;
            }
            if (cleanedName1 > cleanedName2) {
                return 1;
            }
            return c1.id - c2.id;
        };
        return {
            type: "mail.canned.response",
            suggestions: sort ? cannedResponses.sort(sortFunc) : cannedResponses,
        };
    }

    /**
     * Returns suggestions that match the given search term from specified type.
     *
     * @param {Object} [param0={}]
     * @param {String} [param0.delimiter] can be one one of the following: ["@", "#"]
     * @param {String} [param0.term]
     * @param {Object} [options={}]
     * @param {Integer} [options.thread] prioritize and/or restrict
     *  result in the context of given thread
     * @returns {{ type: String, suggestions: Array }}
     */
    searchSuggestions({ delimiter, term }, { thread, sort = false } = {}) {
        thread = toRaw(thread);
        const cleanedSearchTerm = cleanTerm(term);
        switch (delimiter) {
            case "@": {
                return this.searchPartnerSuggestions(cleanedSearchTerm, thread, sort);
            }
            case "#":
                return this.searchChannelSuggestions(cleanedSearchTerm, sort);
            case ":":
                return this.searchCannedResponseSuggestions(cleanedSearchTerm, sort);
        }
        return {
            type: undefined,
            suggestions: [],
        };
    }

    getPartnerSuggestions(thread) {
        let partners;
        const isNonPublicChannel =
            thread &&
            (thread.channel_type === "group" ||
                thread.channel_type === "chat" ||
                (thread.channel_type === "channel" && thread.authorizedGroupFullName));
        if (isNonPublicChannel) {
            // Only return the channel members when in the context of a
            // group restricted channel. Indeed, the message with the mention
            // would be notified to the mentioned partner, so this prevents
            // from inadvertently leaking the private message to the
            // mentioned partner.
            partners = thread.channel_member_ids
                .map((member) => member.persona)
                .filter((persona) => persona.type === "partner");
        } else {
            partners = Object.values(this.store.Persona.records).filter((persona) => {
                if (thread?.model !== "discuss.channel" && persona.eq(this.store.odoobot)) {
                    return false;
                }
                return persona.type === "partner";
            });
        }
        return partners;
    }

    searchPartnerSuggestions(cleanedSearchTerm, thread, sort) {
        const partners = this.getPartnerSuggestions(thread);
        const suggestions = [];
        for (const partner of partners) {
            if (!partner.name) {
                continue;
            }
            if (
                cleanTerm(partner.name).includes(cleanedSearchTerm) ||
                (partner.email && cleanTerm(partner.email).includes(cleanedSearchTerm))
            ) {
                suggestions.push(partner);
            }
        }
        suggestions.push(
            ...this.store.specialMentions.filter(
                (special) =>
                    thread &&
                    special.channel_types.includes(thread.channel_type) &&
                    cleanedSearchTerm.length >= Math.min(4, special.label.length) &&
                    (special.label.startsWith(cleanedSearchTerm) ||
                        cleanTerm(special.description.toString()).includes(cleanedSearchTerm))
            )
        );
        return {
            type: "Partner",
            suggestions: sort
                ? [...this.sortPartnerSuggestions(suggestions, cleanedSearchTerm, thread)]
                : suggestions,
        };
    }

    /**
     * @param {[import("models").Persona | import("@mail/core/common/store_service").SpecialMention]} [partners]
     * @param {String} [searchTerm]
     * @param {import("models").Thread} thread
     * @returns {[import("models").Persona]}
     */
    sortPartnerSuggestions(partners, searchTerm = "", thread = undefined) {
        const cleanedSearchTerm = cleanTerm(searchTerm);
        const compareFunctions = partnerCompareRegistry.getAll();
        const context = this.sortPartnerSuggestionsContext();
        const memberPartnerIds = new Set(
            thread?.channel_member_ids
                .filter((member) => member.persona.type === "partner")
                .map((member) => member.persona.id)
        );
        return partners.sort((p1, p2) => {
            p1 = toRaw(p1);
            p2 = toRaw(p2);
            if (p1.isSpecial || p2.isSpecial) {
                return 0;
            }
            for (const fn of compareFunctions) {
                const result = fn(p1, p2, {
                    env: this.env,
                    memberPartnerIds,
                    searchTerms: cleanedSearchTerm,
                    thread,
                    context,
                });
                if (result !== undefined) {
                    return result;
                }
            }
        });
    }

    sortPartnerSuggestionsContext() {
        return {};
    }

    searchChannelSuggestions(cleanedSearchTerm, sort) {
        const suggestionList = Object.values(this.store.Thread.records).filter(
            (thread) =>
                thread.channel_type === "channel" &&
                thread.displayName &&
                cleanTerm(thread.displayName).includes(cleanedSearchTerm)
        );
        const sortFunc = (c1, c2) => {
            const isPublicChannel1 = c1.channel_type === "channel" && !c2.authorizedGroupFullName;
            const isPublicChannel2 = c2.channel_type === "channel" && !c2.authorizedGroupFullName;
            if (isPublicChannel1 && !isPublicChannel2) {
                return -1;
            }
            if (!isPublicChannel1 && isPublicChannel2) {
                return 1;
            }
            if (c1.hasSelfAsMember && !c2.hasSelfAsMember) {
                return -1;
            }
            if (!c1.hasSelfAsMember && c2.hasSelfAsMember) {
                return 1;
            }
            const cleanedDisplayName1 = cleanTerm(c1.displayName);
            const cleanedDisplayName2 = cleanTerm(c2.displayName);
            if (
                cleanedDisplayName1.startsWith(cleanedSearchTerm) &&
                !cleanedDisplayName2.startsWith(cleanedSearchTerm)
            ) {
                return -1;
            }
            if (
                !cleanedDisplayName1.startsWith(cleanedSearchTerm) &&
                cleanedDisplayName2.startsWith(cleanedSearchTerm)
            ) {
                return 1;
            }
            if (cleanedDisplayName1 < cleanedDisplayName2) {
                return -1;
            }
            if (cleanedDisplayName1 > cleanedDisplayName2) {
                return 1;
            }
            return c1.id - c2.id;
        };
        return {
            type: "Thread",
            suggestions: sort ? suggestionList.sort(sortFunc) : suggestionList,
        };
    }
}

export const suggestionService = {
    dependencies: ["orm", "mail.store"],
    /**
     * @param {import("@web/env").OdooEnv} env
     * @param {import("services").ServiceFactories} services
     */
    start(env, services) {
        return new SuggestionService(env, services);
    },
};

registry.category("services").add("mail.suggestion", suggestionService);
