const catalog = {};

function add(path, model, modelIndex = 0, outfitPiece = null, companion = false) {
  catalog[`the_vault:${path}`] = { model, modelIndex, outfitPiece, companion };
}

function outfit(folder, model) {
  ['helmet', 'chestplate', 'leggings', 'boots'].forEach((slot, index) =>
    add(`gear/armor/${folder}/${slot}`, model, 0, index)
  );
}

function items(type, model, names, startIndex = 0) {
  names.forEach((name, index) => add(`gear/${type}/${name}`, model, startIndex + index));
}

items('shield', 'golden-kappa', ['golden_kappa']);
items('shield', 'i85-mattress', ['mattress']);
items('shield', 'christmas-fireplace', ['fireplace']);
items('shield', 'never-ever', ['never_ever']);
items('shield', 'lamenting-mirror', ['lamenting_mirror']);
items('shield', 'nocturn-shield', ['nocturn']);

outfit('flowery_madness', 'i85-spring-set');
items('axe', 'i85-spring-set', ['spring_axe'], 1);
items('sword', 'i85-spring-set', ['spring_sword'], 2);
items('wand', 'i85-spring-set', ['spring_wand'], 3);
items('shield', 'i85-spring-set', ['spring_shield'], 4);
items('focus', 'i85-spring-set', ['spring_focus'], 5);
items('magnets', 'i85-spring-set', ['spring_magnet'], 6);

outfit('dylans_suit', 'dylan-vip');
items('shield', 'dylan-vip', ['dylans_protector'], 1);
items('axe', 'dylan-vip', ['dylans_cleaver'], 2);
items('wand', 'dylan-vip', ['dylans_magic_stick'], 3);
items('focus', 'dylan-vip', ['dylans_book'], 4);
items('sword', 'dylan-vip', ['dylans_blade'], 5);

outfit('forsaken', 'forsaken-set');
outfit('retirement', 'retirement');
outfit('terra', 'terra-armor');
outfit('companion10', 'companion-leader-s1');

add('gear/armor/royale_crown/helmet', 'i85-royale-crown');
add('gear/armor/falcon/helmet', 'iskall85-falcon-helmet');
add('gear/armor/falcon/chestplate', 'iskall85-falcon-chestplate');
add('gear/armor/sculk/helmet', 'sculk-set', 0, 0);
add('gear/armor/sculk/chestplate', 'sculk-set', 0, 1);
add('gear/armor/green_christmas_hat/helmet', 'green-christmas-hat');
add('gear/armor/snowman/helmet', 'snowman-helmet');
add('gear/armor/combat/helmet', 'striker', 0, 0);
add('gear/armor/combat/chestplate', 'striker', 0, 1);
add('gear/armor/five_in_a_row_guard/chestplate', 'i85-server-bingos');
add('gear/armor/gingerbread/chestplate', 'xmas-dayfour-chest');
add('gear/armor/bloodbane/chestplate', 'bat-chestplate-transmog');

items('axe', 'iskall85-reddragon-axe', ['reddragon_axe']);
items('axe', 'i85-petal-splitter', ['petal_splitter']);
items('axe', 'forsaken-axe', ['forsaken']);
items('axe', 'lost-christmas-axe', ['lost_christmas_axe']);
items('axe', 'arry-axe', ['arry']);
items('axe', 'golden-club', ['golden_club']);
items('axe', 'bat-axe-transmog', ['bloodfang']);
items('axe', 'terra-weapons', ['terraxe']);

items('wand', 'nutcracker-wand', ['nutcracker_wand']);
items('wand', 'hypefuse-scepter', ['hypefuse_scepter']);
items('wand', 'midnight-thorn', ['midnight_thorn']);
items('wand', 'terra-offhands', ['terraforce_wand']);

items('focus', 'i85-treasure-train', ['tiny_treasure_train']);
items('focus', 'iskall85-ancient-scroll', ['ancient_scroll']);
items('focus', 'essence-of-iskallium', ['essence_of_iskallium']);
items('focus', 'terra-offhands', ['terrabinder'], 2);

items('sword', 'i85-twin-blade', ['twin_blade']);
items('sword', 'iskall85-reddragon-sword', ['reddragon_sword']);
items('sword', 'halloween-pumpkin-weapon', ['haunted_dagger']);
items('sword', 'forsaken-sword', ['forsaken']);
items('sword', 'i85-100stream', ['centennial_blade']);
add('gear/sword/lost_christmas', 'lost-christmas-axe', 1);
items('sword', 'buster-sword', ['buster_sword']);
items('sword', 'doomslayer', ['doomslasher']);
add('gear/sword/terras_wrath', 'terra-weapons', 1);

add('gear/shield/flat_terra_shield', 'terra-offhands', 1);
items('magnets', 'halloween-magnet', ['jack_o_magnet']);

[
  ['baby_creeper_gold', 'golden-baby-creeper'],
  ['baby_creeper_pog', 'baby-creeper-pog'],
  ['dino', 'i85-companion-dino'],
  ['dylan_penguin', 'i85-dylan-penguin'],
  ['bumbo_pumpkini', 'halloween-pumpkin'],
  ['dylan_pink', 'pink-dylan'],
  ['bumbo_cactoni', 'bumbo-cactoni'],
  ['carrot', 'carrot'],
  ['golden_bumbo_cactoni', 'golden-bumbo-cactoni'],
  ['santa_dylan', 'i85-xmas-day3'],
  ['gingerbread_man', 'gingerbread-man'],
  ['bumbo_frostoni', 'bumbo-frostoni'],
  ['blueberry_turtle', 'blueberry-turtle'],
  ['dylan_gold', 'golden-dylan'],
  ['teddy', 'valentines-teddy'],
  ['muddy_elephant', 'muddy-elephant'],
  ['mini_dweller', 'mini-dweller'],
  ['mini_butcher', 'mini-butcher'],
  ['mini_elite_witherskelly', 'mini-elite-witherskelly'],
].forEach(([path, model]) => add(path, model, 0, null, true));

add('gear/armor/dread_steps/boots', 'patreon-dweller-gear', 0, 0);
add('gear/sword/dweller_sword', 'patreon-dweller-gear', 1);
add('gear/axe/dweller_axe', 'patreon-dweller-gear', 2);

['helmet', 'chestplate', 'leggings', 'boots'].forEach((slot, index) =>
  add(`gear/armor/darkcheesewarrior/${slot}`, 'patreon-cheeser-gear', 0, index)
);
add('gear/sword/plunder_n_cheese', 'patreon-cheeser-gear', 1);

['helmet', 'chestplate', 'leggings', 'boots'].forEach((slot, index) =>
  add(`gear/armor/goblin/${slot}`, 'patreon-goblin-gear', 0, index)
);
add('gear/armor/hoarders_harness/chestplate', 'patreon-goblin-gear', 1);

['helmet', 'chestplate', 'leggings', 'boots'].forEach((slot, index) =>
  add(`gear/armor/champion/${slot}`, 'patreon-champion-gear', 0, index)
);
add('gear/armor/triumphant_crown/helmet', 'patreon-champion-gear', 1);
add('gear/axe/godaxe', 'patreon-champion-gear', 2);
add('slimey', 'patreon-legend-pet', 0, null, true);

export default catalog;
