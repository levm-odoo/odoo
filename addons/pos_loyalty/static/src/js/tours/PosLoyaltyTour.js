/** @odoo-module **/

import { PosLoyalty } from 'pos_loyalty.tour.PosCouponTourMethods';
import { ProductScreen } from 'point_of_sale.tour.ProductScreenTourMethods';
import { getSteps, startSteps } from 'point_of_sale.tour.utils';
import Tour from 'web_tour.tour';

// --- PoS Loyalty Tour Basic Part 1 ---
// Generate coupons for PosLoyaltyTour2.
startSteps();

ProductScreen.do.confirmOpeningPopup();
ProductScreen.do.clickHomeCategory();

// basic order
// just accept the automatically applied promo program
// applied programs:
//   - on cheapest product
ProductScreen.exec.addOrderline('Whiteboard Pen', '5');
PosLoyalty.check.hasRewardLine('90% on the cheapest product', '-2.88');
PosLoyalty.do.selectRewardLine('on the cheapest product');
PosLoyalty.check.orderTotalIs('13.12');
PosLoyalty.exec.finalizeOrder('Cash', '20');

// remove the reward from auto promo program
// no applied programs
ProductScreen.exec.addOrderline('Whiteboard Pen', '6');
PosLoyalty.check.hasRewardLine('on the cheapest product', '-2.88');
PosLoyalty.check.orderTotalIs('16.32');
PosLoyalty.exec.removeRewardLine('90% on the cheapest product');
PosLoyalty.check.orderTotalIs('19.2');
PosLoyalty.exec.finalizeOrder('Cash', '20');

// order with coupon code from coupon program
// applied programs:
//   - coupon program
ProductScreen.exec.addOrderline('Desk Organizer', '9');
PosLoyalty.check.hasRewardLine('on the cheapest product', '-4.59');
PosLoyalty.exec.removeRewardLine('90% on the cheapest product');
PosLoyalty.check.orderTotalIs('45.90');
PosLoyalty.do.enterCode('invalid_code', false);
PosLoyalty.do.enterCode('1234');
PosLoyalty.do.claimReward('Desk Organizer');
PosLoyalty.check.hasRewardLine('Desk Organizer (free)', '0.00');
PosLoyalty.exec.finalizeOrder('Cash', '50');

// Use coupon but eventually remove the reward
// applied programs:
//   - on cheapest product
ProductScreen.exec.addOrderline('Letter Tray', '4');
ProductScreen.exec.addOrderline('Desk Organizer', '9');
PosLoyalty.check.hasRewardLine('90% on the cheapest product', '-4.75');
PosLoyalty.check.orderTotalIs('62.27');
PosLoyalty.do.enterCode('5678');
// Clicked product becomes a reward line since it's a claimable reward.
ProductScreen.do.clickDisplayedProduct('Desk Organizer');
PosLoyalty.check.hasRewardLine('Desk Organizer (free)', '0.00');
ProductScreen.do.clickDisplayedProduct('Desk Organizer');
PosLoyalty.check.hasRewardLine('Desk Organizer (free)', '0.00', '2.00');
PosLoyalty.exec.removeRewardLine('Desk Organizer (free)');
// Add new product to change the order total. Important to avoid random runbot error.
ProductScreen.do.clickDisplayedProduct('Whiteboard Pen');
PosLoyalty.check.orderTotalIs('67.34');
PosLoyalty.exec.finalizeOrder('Cash', '90');

// specific product discount
// applied programs:
//   - on cheapest product
//   - on specific products
ProductScreen.exec.addOrderline('Magnetic Board', '10') // 1.98
ProductScreen.exec.addOrderline('Desk Organizer', '3') // 5.1
ProductScreen.exec.addOrderline('Letter Tray', '4') // 4.8 tax 10%
PosLoyalty.check.hasRewardLine('90% on the cheapest product', '-1.78')
PosLoyalty.check.orderTotalIs('54.44')
PosLoyalty.do.enterCode('promocode', false)
PosLoyalty.check.hasRewardLine('50% on specific products', '-16.66') // 17.55 - 1.78*0.5
PosLoyalty.check.orderTotalIs('37.78')
PosLoyalty.exec.finalizeOrder('Cash', '50')

Tour.register('PosLoyaltyTour1', { test: true, url: '/pos/web' }, getSteps());

// --- PoS Loyalty Tour Basic Part 2 ---
// Using the coupons generated from PosLoyaltyTour1.
startSteps();

ProductScreen.do.clickHomeCategory();

// Test that global discount and cheapest product discounts can be accumulated.
// Applied programs:
//   - global discount
//   - on cheapest discount
ProductScreen.exec.addOrderline('Desk Organizer', '10'); // 5.1
PosLoyalty.check.hasRewardLine('on the cheapest product', '-4.59');
ProductScreen.exec.addOrderline('Letter Tray', '4'); // 4.8 tax 10%
PosLoyalty.check.hasRewardLine('on the cheapest product', '-4.75');
PosLoyalty.do.enterCode('123456');
PosLoyalty.check.hasRewardLine('10% on your order', '-5.10');
PosLoyalty.check.hasRewardLine('10% on your order', '-1.64');
PosLoyalty.check.orderTotalIs('60.63'); //SUBTOTAL
PosLoyalty.exec.finalizeOrder('Cash', '70');

// Scanning coupon twice.
// Also apply global discount on top of free product to check if the
// calculated discount is correct.
// Applied programs:
//  - coupon program (free product)
//  - global discount
//  - on cheapest discount
ProductScreen.exec.addOrderline('Desk Organizer', '11'); // 5.1 per item
PosLoyalty.check.hasRewardLine('90% on the cheapest product', '-4.59');
PosLoyalty.check.orderTotalIs('51.51');
// add global discount and the discount will be replaced
PosLoyalty.do.enterCode('345678');
PosLoyalty.check.hasRewardLine('10% on your order', '-5.15');
// add free product coupon (for qty=11, free=4)
// the discount should change after having free products
// it should go back to cheapest discount as it is higher
PosLoyalty.do.enterCode('5678');
ProductScreen.do.clickDisplayedProduct('Desk Organizer');
PosLoyalty.check.hasRewardLine('Desk Organizer (free)', '0.00', '1.00');
ProductScreen.do.clickDisplayedProduct('Desk Organizer');
PosLoyalty.check.hasRewardLine('Desk Organizer (free)', '0.00', '2.00');
ProductScreen.do.clickDisplayedProduct('Desk Organizer');
PosLoyalty.check.hasRewardLine('Desk Organizer (free)', '0.00', '3.00');
ProductScreen.do.clickDisplayedProduct('Desk Organizer');
PosLoyalty.check.hasRewardLine('Desk Organizer (free)', '0.00', '4.00');
ProductScreen.do.clickDisplayedProduct('Desk Organizer');
PosLoyalty.check.hasRewardLine('90% on the cheapest product', '-4.59');
// set quantity to 18
// free qty stays the same since the amount of points on the card only allows for 4 free products
ProductScreen.do.pressNumpad('1 8')
// At this point, the number of free products didn't change.
// TODO: Should the coupon reward (free product) be removed after changing the quantity?
PosLoyalty.check.hasRewardLine('10% on your order', '-8.72');
PosLoyalty.check.orderTotalIs('78.49');
PosLoyalty.exec.finalizeOrder('Cash', '80');

// Specific products discount (with promocode) and free product (1357)
// Applied programs:
//   - discount on specific products
//   - free product
ProductScreen.exec.addOrderline('Desk Organizer', '6'); // 5.1 per item
PosLoyalty.check.hasRewardLine('on the cheapest product', '-4.59');
PosLoyalty.exec.removeRewardLine('90% on the cheapest product');
PosLoyalty.do.enterCode('promocode', false);
PosLoyalty.check.hasRewardLine('50% on specific products', '-15.30');
PosLoyalty.do.enterCode('1357');
ProductScreen.do.clickDisplayedProduct('Desk Organizer');
PosLoyalty.check.hasRewardLine('Desk Organizer (free)', '0.00', '1.00');
ProductScreen.do.clickDisplayedProduct('Desk Organizer');
PosLoyalty.check.hasRewardLine('Desk Organizer (free)', '0.00', '2.00');
PosLoyalty.check.hasRewardLine('50% on specific products', '-15.30');
PosLoyalty.check.orderTotalIs('15.30');
PosLoyalty.exec.finalizeOrder('Cash', '20');

// Check reset program
// Enter two codes and reset the programs.
// The codes should be checked afterwards. They should return to new.
// Applied programs:
//   - cheapest product
ProductScreen.exec.addOrderline('Monitor Stand', '6'); // 3.19 per item
PosLoyalty.do.enterCode('098765');
PosLoyalty.check.hasRewardLine('90% on the cheapest product', '-2.87');
PosLoyalty.check.hasRewardLine('10% on your order', '-1.63');
PosLoyalty.check.orderTotalIs('14.64');
PosLoyalty.exec.removeRewardLine('90% on the cheapest product');
PosLoyalty.check.hasRewardLine('10% on your order', '-1.91');
PosLoyalty.check.orderTotalIs('17.23');
PosLoyalty.do.resetActivePrograms();
PosLoyalty.check.hasRewardLine('90% on the cheapest product', '-2.87');
PosLoyalty.check.orderTotalIs('16.27');
PosLoyalty.exec.finalizeOrder('Cash', '20');

Tour.register('PosLoyaltyTour2', { test: true, url: '/pos/web' }, getSteps());
