import { registry } from "@web/core/registry";
import { contains } from "@web/../tests/utils";
import { patchWithCleanup } from "@web/../tests/helpers/utils";
import { TourHelpers } from "@web_tour/tour_service/tour_helpers";

const messagesContain = (text) => `.o-livechat-root:shadow .o-mail-Message:contains("${text}")`;

registry.category("web_tour.tours").add("website_livechat_chatbot_flow_tour", {
    checkDelay: 50,
    steps: () => {
        patchWithCleanup(window, {
            debounceAnswerCount: 0,
        });
        patchWithCleanup(odoo.__WOWL_DEBUG__.root.env.services["mail.store"].Chatbot.prototype, {
            // Count the number of times this method is called to check whether the chatbot is regularly
            // checking the user's input in the multi line step until the user finishes typing.
            async _delayThenProcessAnswerAgain(message) {
                window.debounceAnswerCount++;
                return await super._delayThenProcessAnswerAgain(message);
            },
        });
        return [
            {
                trigger: messagesContain("Hello! I'm a bot!"),
                run: () => {
                    // make chat bot faster for this tour
                    odoo.__WOWL_DEBUG__.root.env.services[
                        "im_livechat.chatbot"
                    ].chatbot.script.isLivechatTourRunning = true;
                },
            },
            {
                // check second welcome message is posted
                trigger: messagesContain("I help lost visitors find their way."),
            },
            {
                trigger: messagesContain("How can I help you?"),
                // check question_selection message is posted and reactions are not
                // available since the thread is not yet persisted
                run() {
                    if (
                        this.anchor.querySelector(
                            ".o-mail-Message-actions [title='Add a Reaction']"
                        )
                    ) {
                        console.error(
                            "Reactions should not be available before thread is persisted."
                        );
                    }
                },
            },
            {
                trigger: '.o-livechat-root:shadow li:contains("I\'d like to buy the software")',
                run: "click",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-ChatWindow",
                // check selected option is posted and reactions are available since
                // the thread has been persisted in the process
                async run() {
                    await contains(".o-mail-Message-actions [title='Add a Reaction']", {
                        target: this.anchor.getRootNode(),
                        parent: [".o-mail-Message", { text: "I'd like to buy the software" }],
                    });
                },
            },
            {
                // check ask email step following selecting option A
                trigger: messagesContain("Can you give us your email please?"),
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input ",
                run: "editor No, you won't get my email!",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "press Enter",
            },
            {
                // check invalid email detected and the bot asks for a retry
                trigger: messagesContain(
                    "'No, you won't get my email!' does not look like a valid email. Can you please try again?"
                ),
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "editor okfine@fakeemail.com",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "press Enter",
            },
            {
                // check that this time the email goes through and we proceed to next step
                trigger: messagesContain("Your email is validated, thank you!"),
            },
            {
                // should ask for website now
                trigger: messagesContain("Would you mind providing your website address?"),
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "editor https://www.fakeaddress.com",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "press Enter",
            },
            {
                trigger: messagesContain(
                    "Great, do you want to leave any feedback for us to improve?"
                ),
                // should ask for feedback now
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "editor Yes, actually, I'm glad you asked!",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "press Enter",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "editor I think it's outrageous that you ask for all my personal information!",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "press Enter",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "editor I will be sure to take this to your manager!",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "press Enter",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "editor I want to say...",
            },
            {
                // Simulate that the user is typing, so the chatbot shouldn't go to the next step
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run() {
                    const counter = window.debounceAnswerCount;
                    const target = new TourHelpers(this.anchor);
                    const delay =
                        odoo.__WOWL_DEBUG__.root.env.services["mail.store"].Chatbot
                            .MULTILINE_STEP_DEBOUNCE_DELAY_TOUR;
                    target.editor("Never mind!");
                    setTimeout(() => {
                        if (window.debounceAnswerCount <= counter) {
                            console.error(
                                "Chatbot should stay in multi line step when user is typing."
                            );
                        }
                    }, delay);
                    setTimeout(() => {
                        target.editor("Never mind!!!!");
                        const counter = window.debounceAnswerCount;
                        setTimeout(() => {
                            if (window.debounceAnswerCount <= counter) {
                                console.error(
                                    "Chatbot should stay in multi line step if user isn't done typing."
                                );
                            }
                        }, delay * 2);
                    }, delay + 200);
                },
            },
            {
                // last step is displayed
                trigger: messagesContain("Ok bye!"),
            },
            {
                trigger:
                    ".o-livechat-root:shadow .o-mail-ChatWindow-command[title='Restart Conversation']",
                run: "click",
            },
            {
                // check that conversation is properly restarting
                trigger: messagesContain("Restarting conversation..."),
            },
            {
                // check first welcome message is posted
                trigger: messagesContain("Hello! I'm a bot!"),
            },
            {
                // check second welcome message is posted
                trigger: messagesContain("I help lost visitors find their way."),
            },
            {
                // check question_selection message is posted
                trigger: messagesContain("How can I help you?"),
            },
            {
                trigger: '.o-livechat-root:shadow li:contains("Pricing Question")',
                run: "click",
            },
            {
                // the path should now go towards 'Pricing Question (first part)'
                trigger: messagesContain(
                    "For any pricing question, feel free ton contact us at pricing@mycompany.com"
                ),
            },
            {
                // the path should now go towards 'Pricing Question (second part)'
                trigger: messagesContain("We will reach back to you as soon as we can!"),
            },
            {
                // should ask for website now
                trigger: messagesContain("Would you mind providing your website address?"),
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "editor no",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "press Enter",
            },
            {
                // should ask for feedback now
                trigger: messagesContain(
                    "Great, do you want to leave any feedback for us to improve?"
                ),
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "editor no, nothing so say",
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
                run: "press Enter",
            },
            {
                trigger: messagesContain("Ok bye!"),
                run: "click",
            },
            {
                trigger:
                    ".o-livechat-root:shadow .o-mail-ChatWindow-command[title='Restart Conversation']",
                run: "click",
            },
            {
                trigger: ".o-livechat-root:shadow li:contains(I want to speak with an operator)",
                run: "click",
            },
            {
                trigger: messagesContain("I will transfer you to a human."),
            },
            {
                trigger: ".o-livechat-root:shadow .o-mail-Composer-input",
            },
        ];
    },
});
