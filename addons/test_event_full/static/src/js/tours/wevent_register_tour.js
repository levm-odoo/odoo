import { registry } from "@web/core/registry";
import { session } from "@web/session";

/**
 * TALKS STEPS
 */
var reminderToggleSteps = function (talkName, reminderOn, toggleReminder) {
    var steps = [];
    if (reminderOn) {
        steps = steps.concat([{
            content: `Check Favorite for ${talkName} was already on`,
            trigger: 'div.o_wetrack_js_reminder i.fa-bell',
            break: true
        }]);
    }
    else {
        steps = steps.concat([{
            content: `Check Favorite for ${talkName} was off`,
            trigger: 'div.o_wetrack_js_reminder i.fa-bell-o',
        }]);
        if (toggleReminder) {
            steps = steps.concat([{
                content: 'Click on favorite button',
                trigger: 'i[title="Set Favorite"]',
                run: 'click',
            }]);
            if (session.is_public){
                steps = steps.concat([{
                    content: 'The form of the email reminder modal is filled',
                    trigger: "#o_wetrack_email_reminder_form input[name='email']",
                    run: 'fill visitor@odoo.com',
                },
                {
                    content: 'The form is submit',
                    trigger: '#o_wetrack_email_reminder_form button[type="submit"]',
                    run: 'click',
                }]);
            }
            steps = steps.concat([{
                content: `Check Favorite for ${talkName} is now on`,
                trigger: 'div.o_wetrack_js_reminder i.fa-bell',
            }]);
        }
    }
    return steps;
};

var discoverTalkSteps = function (talkName, fromList, checkToggleReminder, reminderOn, toggleReminder) {
    var steps;
    if (fromList) {
        steps = [{
            content: 'Go on "' + talkName + '" talk in List',
            trigger: 'a:contains("' + talkName + '")',
            run: "click",
        }];
    }
    else {
        steps = [{
            content: 'Click on Live Track',
            trigger: 'article span:contains("' + talkName + '")',
            run: 'click',
        }];
    }
    steps = steps.concat([{
        content: `Check we are on the "${talkName}" talk page`,
        trigger: 'div.o_wesession_track_main',
    }]);
    if (checkToggleReminder){
        steps = steps.concat(reminderToggleSteps(talkName, reminderOn, toggleReminder));
    }
    console.log(steps);
    return steps;
};


/**
 * ROOMS STEPS
 */

var discoverRoomSteps = function (roomName) {
    var steps = [{
        content: 'Go on "' + roomName + '" room in List',
        // can't click on it, it will try to launch Jitsi and fail on chrome headless
        trigger: 'a.o_wevent_meeting_room_card h4:contains("' + roomName + '")',
    }];
    return steps;
};


/**
 * REGISTER STEPS
 */

const registerSteps = [
    {
        content: "Open ticket modal",
        trigger: "button.btn-primary:contains(Register):enabled",
        run: "click",
    },
    {
        content: "Select 2 units of 'Standard' ticket type",
        trigger: ".modal .o_wevent_ticket_selector select",
        run: "select 2",
    },
    {
        content: "Click on 'Register' button",
        trigger: ".modal #o_wevent_tickets .btn-primary:contains(Register):enabled",
        run: "click",
    },
    {
        content: "Wait the modal is shown before continue",
        trigger: ".modal.modal_shown.show form[id=attendee_registration]",
    },
    {
        trigger: ".modal input[name*='1-name']",
        run: "edit Raoulette Poiluchette",
    },
    {
        trigger: ".modal input[name*='1-phone']",
        run: "edit 0456112233",
    },
    {
        trigger: ".modal input[name*='1-email']",
        run: "edit raoulette@example.com",
    },
    {
        trigger: ".modal select[name*='1-simple_choice']",
        run: "selectByLabel Consumers",
    },
    {
        trigger: ".modal input[name*='2-name']",
        run: "edit Michel Tractopelle",
    },
    {
        trigger: ".modal input[name*='2-phone']",
        run: "edit 0456332211",
    },
    {
        trigger: ".modal input[name*='2-email']",
        run: "edit michel@example.com",
    },
    {
        trigger: ".modal select[name*='2-simple_choice']",
        run: "selectByLabel Research",
    },
    {
        trigger: ".modal textarea[name*='text_box']",
        run: "edit An unicorn told me about you. I ate it afterwards.",
    },
    {
        trigger: ".modal input[name*='1-name'], input[name*='2-name'], input[name*='3-name']",
    },
    {
        content: "Validate attendees details",
        trigger: ".modal button[type=submit]:enabled",
        run: "click",
    },
    {
        content: "Click on 'register favorites talks' button",
        trigger: "a:contains(register to your favorites talks now)",
        run: "click",
    },
    {
        trigger: "h5:contains(Book your talks)",
    },
];

/**
 * MAIN STEPS
 */

var initTourSteps = function (eventName) {
    return [{
        content: 'Go on "' + eventName + '" page',
        trigger: 'a[href*="/event"]:contains("' + eventName + '"):first',
        run: "click",
    }];
};

var browseTalksSteps = [{
    content: 'Browse Talks',
    trigger: 'a:contains("Talks")',
    run: "click",
}, {
    content: 'Check we are on the talk list page',
    trigger: 'h5:contains("Book your talks")',
}];

var browseBackSteps = [{
    content: 'Browse Back',
    trigger: 'a:contains("All Talks")',
    run: "click",
}, {
    content: 'Check we are back on the talk list page',
    trigger: 'h5:contains("Book your talks")',
}];

var browseMeetSteps = [{
    content: 'Browse Meet',
    trigger: 'a:contains("Community")',
    run: "click",
}, {
    content: 'Check we are on the community page',
    trigger: 'h3:contains("Join a room")',
}];


registry.category("web_tour.tours").add('wevent_register', {
    url: '/event',
    steps: () => [].concat(
        initTourSteps('Online Reveal'),
        browseTalksSteps,
        discoverTalkSteps('What This Event Is All About', true, true, true),
        browseTalksSteps,
        discoverTalkSteps('Live Testimonial', false, false, false, false),
        browseTalksSteps,
        discoverTalkSteps('Our Last Day Together!', true, true, false, true),
        browseBackSteps,
        browseMeetSteps,
        discoverRoomSteps('Best wood for furniture'),
        registerSteps,
    )
});
