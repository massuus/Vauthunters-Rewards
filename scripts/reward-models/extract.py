"""Extract reward previews; never modifies the game installation.

Usage: python scripts/reward-models/extract.py PATH_TO_THE_VAULT_JAR
Assets remain the work of the Vault Hunters artists, not this website.
"""
import base64
import json
from pathlib import Path
import struct
import sys
import zipfile

OUTPUT = Path(__file__).resolve().parents[2] / 'public/data/models'


def extract(jar_path):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(jar_path) as jar:
        def read(path):
            return json.loads(jar.read('assets/the_vault/' + path))

        def texture(path):
            data = jar.read('assets/the_vault/textures/' + path + '.png')
            return 'data:image/png;base64,' + base64.b64encode(data).decode('ascii')

        def item_texture(path):
            asset = 'assets/the_vault/textures/' + path + '.png'
            data = jar.read(asset)
            width, height = struct.unpack('>II', data[16:24])
            metadata_path = asset + '.mcmeta'
            metadata = json.loads(jar.read(metadata_path)) if metadata_path in jar.namelist() else None
            animation = (metadata or {}).get('animation')
            if animation is None:
                aspect = 1
            else:
                frame_width = animation.get('width', width)
                frame_height = animation.get('height', height)
                aspect = frame_height / frame_width
            return {
                'source': 'data:image/png;base64,' + base64.b64encode(data).decode('ascii'),
                'uvAspect': aspect,
                'animation': animation,
            }

        definitions = json.loads(Path(__file__).with_name('companions.json').read_text())
        rewards = json.loads((OUTPUT.parent / 'set-art.json').read_text(encoding='utf-8'))
        bundles = []
        catalog = {}
        for key, (geo, animation, skin) in definitions.items():
            clips = read('animations/' + animation + '.animation.json')['animations']
            idle = 'idle' if 'idle' in clips else 'idle_normal'
            movement = next(name for name in ('run', 'walk', 'float_normal') if name in clips)
            selected = {name: clips[name] for name in (idle, movement, 'sleep', 'sleepy')}
            companion = {
                'kind': 'companion',
                'label': rewards[key]['label'],
                'geometry': read('geo/' + geo + '.geo.json')['minecraft:geometry'][0],
                'animations': selected,
                'clips': {'idle': idle, 'run': movement, 'sleep': 'sleep', 'sleepy': 'sleepy'},
                'texture': texture('entity/' + skin),
            }
            if key == 'patreon_legend_pet':
                # Slimey's outer body is a translucent shell around the face
                # and inner slime, not an opaque cutout like other companions.
                companion['translucent'] = True
            name = 'golden-baby-creeper' if key == 'baby_creeper_gold' else key.replace('_', '-')
            bundles.append((name, companion))
            # Mixed rewards keep their additional weapon/armor artwork.
            catalog[key] = {'model': name, 'companion': True,
                            'firstImageOnly': key in ('i85_xmas_day3', 'halloween_pumpkin')}
        weapon_definitions = json.loads(
            Path(__file__).with_name('weapons.json').read_text())
        flowery_geometry = json.loads(
            Path(__file__).with_name('flowery-madness-geometry.json').read_text())
        bingo_geometry = json.loads(
            Path(__file__).with_name('five-in-a-row-geometry.json').read_text())
        falcon_geometry = json.loads(
            Path(__file__).with_name('falcon-geometry.json').read_text())
        sculk_geometry = json.loads(
            Path(__file__).with_name('sculk-geometry.json').read_text())
        batch_armor = {
            name: json.loads(Path(__file__).with_name(file).read_text())
            for name, file in {
                'green_christmas_hat': 'christmas-hat-geometry.json',
                'xmas_dayfour_chest': 'gingerbread-chestplate-geometry.json',
                'snowman_helmet': 'snowman-helm-geometry.json',
                'girl_boss': 'girl-boss-geometry.json',
                'hellboy_head': 'hellboy-geometry.json',
                'retirement': 'retirement-geometry.json',
                'terra_armor': 'terra-armor-geometry.json',
                'forsaken_set': 'forsaken-armor-geometry.json',
                'bat_chestplate_transmog': 'bloodbane-armor-geometry.json',
                'i85_royale_crown': 'royale-crown-geometry.json',
                'companion_leader_s1': 'companion10-armor-geometry.json',
                'dylan_vip': 'dylans-suit-geometry.json',
            }.items()
        }
        combat_geometry = json.loads(
            Path(__file__).with_name('combat-geometry.json').read_text())
        patreon_geometry = {
            name: json.loads(Path(__file__).with_name(file).read_text())
            for name, file in {
                'dread_steps': 'dread-steps-geometry.json',
                'cheeser': 'dark-cheese-warrior-geometry.json',
                'goblin': 'goblin-armor-geometry.json',
                'hoarders_harness': 'hoarders-harness-geometry.json',
                'champion': 'champion-geometry.json',
                'triumphant_crown': 'triumphant-crown-geometry.json',
            }.items()
        }

        generic_armor = [
            {'id': 'generic-head', 'name': 'head', 'parent': 'root',
             'pivot': [0, 0, 0], 'rotation': [0, 0, 0],
             'cubes': [{'from': [-4, -8, -4], 'size': [8, 8, 8],
                        'inflate': 1, 'uv': [0, 0], 'mirror': False}]},
            {'id': 'generic-body', 'name': 'body', 'parent': 'root',
             'pivot': [0, 0, 0], 'rotation': [0, 0, 0],
             'cubes': [{'from': [-4, 0, -2], 'size': [8, 12, 4],
                        'inflate': 1, 'uv': [16, 16], 'mirror': False}]},
            {'id': 'generic-right-leg', 'name': 'right_leg', 'parent': 'root',
             'pivot': [-1.9, 12, 0], 'rotation': [0, 0, 0],
             'cubes': [{'from': [-2, 0, -2], 'size': [4, 12, 4],
                        'inflate': 1, 'uv': [0, 16], 'mirror': False}]},
            {'id': 'generic-left-leg', 'name': 'left_leg', 'parent': 'root',
             'pivot': [1.9, 12, 0], 'rotation': [0, 0, 0],
             'cubes': [{'from': [-2, 0, -2], 'size': [4, 12, 4],
                        'inflate': 1, 'uv': [16, 48], 'mirror': False}]},
        ]

        def armor_piece(nodes, roots, texture_path, texture_size,
                        inherited_nodes=None, texture_folder='flowery_madness',
                        animations=None, preview_tilt=0, preview_scale=1):
            by_id = {node['id']: node for node in nodes}

            def top_name(node):
                current = node
                while current['parent'] != 'root':
                    current = by_id[current['parent']]
                return current['name']

            return {
                # Keep the shared model-data contract used by validation tests;
                # armor geometry lives in the hierarchical nodes below.
                'elements': [],
                'nodes': (inherited_nodes or []) + [
                    node for node in nodes if top_name(node) in roots
                ],
                'textureSize': texture_size,
                'textures': {
                    'default': item_texture(
                        'item/gear/armor/' + texture_folder + '/' + texture_path)
                },
                'animations': animations or {},
                'previewTilt': preview_tilt,
                'previewScale': preview_scale,
                'preserveFlatFaces': False,
            }
        for key, paths in weapon_definitions.items():
            weapons = []
            for path in paths:
                if path.startswith('generated:'):
                    texture_path = path.split(':', 1)[1]
                    model = {
                        'elements': [{
                            'from': [0, 0, 7.75],
                            'to': [16, 16, 8.25],
                            'faces': {
                                'north': {'uv': [0, 0, 16, 16], 'texture': '#0'},
                                'south': {'uv': [16, 0, 0, 16], 'texture': '#0'},
                            },
                        }],
                        'texture_size': [16, 16],
                        'display': {'gui': {'rotation': [0, 0, 0], 'scale': [0.85, 0.85, 0.85]}},
                        'textures': {'0': 'the_vault:item/gear/' + texture_path},
                    }
                else:
                    model = read('models/item/gear/' + path + '.json')
                if key == 'doomslayer':
                    # Blockbench kept both sides of several fully hidden joins.
                    # Three.js draws those coplanar faces simultaneously, so
                    # cull only the internal pairs to prevent z-fighting.
                    internal_faces = {
                        0: ('west', 'up', 'down'),
                        2: ('east',),
                        3: ('down',),
                        7: ('west',),
                        8: ('east', 'west'),
                        9: ('up',),
                        12: ('east',),
                    }
                    for index, faces in internal_faces.items():
                        for face in faces:
                            model['elements'][index]['faces'].pop(face, None)
                    # The small crystal at the blade tip overlaps the long
                    # crystal plane at exactly Z=8 after both Z rotations.
                    # Minecraft tolerates the coplanar authoring differently;
                    # give the tip a sub-pixel separation for stable WebGL.
                    model['elements'][11]['from'][2] = 8.012
                    model['elements'][11]['to'][2] = 8.012
                weapons.append({
                    'elements': model['elements'],
                    'outlineDepthBias': key == 'essence_of_iskallium',
                    'textureSize': model.get('texture_size', [16, 16]),
                    'display': model.get('display', {}),
                    'textures': {texture_key: item_texture(value.split(':', 1)[1])
                                 for texture_key, value in model['textures'].items()},
                })
            if key == 'i85_spring_set':
                main = flowery_geometry['main']
                leggings = flowery_geometry['leggings']
                # ArmorLayers.LeggingsLayer renders the inherited HumanoidModel
                # body as well as the two custom legs. FloweryMadnessLayers only
                # replaces the legs, so this vanilla waist cube does not appear
                # in the decompiled subclass and must be retained explicitly.
                leggings_body = [{
                    'id': 'leggings-inherited-body',
                    'name': 'body',
                    'parent': 'root',
                    'pivot': [0, 0, 0],
                    'rotation': [0, 0, 0],
                    'cubes': [{
                        'from': [-4, 0, -2],
                        'size': [8, 12, 4],
                        'inflate': 0,
                        'uv': [16, 16],
                        'mirror': False,
                    }],
                }]
                armor_outfit = [
                    armor_piece(main, {'head'}, 'armor_layer1_overlay', [256, 256]),
                    armor_piece(main, {'body', 'right_arm', 'left_arm'},
                                'armor_layer1_overlay', [256, 256]),
                    armor_piece(leggings, {'right_leg', 'left_leg'},
                                'armor_layer2_overlay', [64, 64], leggings_body),
                    armor_piece(main, {'right_leg', 'left_leg'},
                                'armor_layer1_overlay', [256, 256]),
                ]
                # Flowery Madness builds its petals, leaves and wings from
                # zero-thickness cubes whose artwork is authored across both
                # opposing Java cube faces. Keeping only the inferred outward
                # face can select a blank strip on rotated planes, leaving
                # detached lines instead of the decoration visible in-game.
                for piece in armor_outfit:
                    piece['preserveFlatFaces'] = True
                # These four layers share Minecraft's humanoid coordinate
                # system. Keep them in one preview so the reward shows the
                # complete equipped outfit instead of four disconnected parts.
                weapons = [{'outfit': armor_outfit}] + weapons
            if key == 'i85_server_bingos':
                weapons = [armor_piece(
                    bingo_geometry['main'],
                    {'body', 'right_arm', 'left_arm'},
                    'armor_layer1_overlay',
                    [128, 128],
                    texture_folder='five_in_a_row_guard',
                )]
            if key == 'iskall85_falcon_helmet':
                weapons = [armor_piece(
                    falcon_geometry['main'], {'head'},
                    'armor_layer1_overlay', [128, 128],
                    texture_folder='falcon',
                    animations={'Propeler': {'axis': 'y', 'turnsPerSecond': 10 / 3.6}},
                    preview_tilt=-0.32,
                )]
            if key == 'iskall85_falcon_chestplate':
                weapons = [armor_piece(
                    falcon_geometry['main'], {'body', 'right_arm', 'left_arm'},
                    'armor_layer1_overlay', [128, 128],
                    texture_folder='falcon',
                    animations={'Cog': {'axis': 'x', 'turnsPerSecond': 2.5 / 3.6}},
                )]
            if key == 'sculk_set':
                sculk = sculk_geometry['main']
                weapons = [{'outfit': [
                    armor_piece(sculk, {'head'}, 'armor_layer1_overlay', [128, 128],
                                texture_folder='sculk'),
                    armor_piece(sculk, {'body', 'right_arm', 'left_arm'},
                                'armor_layer1_overlay', [128, 128],
                                texture_folder='sculk'),
                ]}]
            single_armor = {
                'green_christmas_hat': ('head', 'green_christmas_hat', 64),
                'xmas_dayfour_chest': ('chest', 'gingerbread', 128),
                'snowman_helmet': ('head', 'snowman', 128),
                'hellboy_head': ('head', 'hellboy', 64),
            }
            if key in single_armor:
                slot, folder, size = single_armor[key]
                roots = {'head'} if slot == 'head' else {'body', 'right_arm', 'left_arm'}
                weapons = [armor_piece(
                    batch_armor[key]['main'], roots,
                    'armor_layer1_overlay', [size, size], texture_folder=folder,
                    preview_scale=0.6 if key == 'green_christmas_hat' else 1,
                )]
            outfit_armor = {
                'girl_boss': ('girl_boss', 128, 64),
                'retirement': ('retirement', 64, 64),
                'terra_armor': ('terra', 128, 64),
            }
            if key in outfit_armor:
                folder, main_size, leg_size = outfit_armor[key]
                geometry = batch_armor[key]
                weapons = [{'outfit': [
                    armor_piece(geometry['main'], {'head'},
                                'armor_layer1_overlay', [main_size, main_size],
                                texture_folder=folder),
                    armor_piece(geometry['main'], {'body', 'right_arm', 'left_arm'},
                                'armor_layer1_overlay', [main_size, main_size],
                                texture_folder=folder),
                    armor_piece(geometry['leggings'], {'body', 'right_leg', 'left_leg'},
                                'armor_layer2_overlay', [leg_size, leg_size],
                                texture_folder=folder),
                    armor_piece(geometry['main'], {'right_leg', 'left_leg'},
                                'armor_layer1_overlay', [main_size, main_size],
                                texture_folder=folder),
                ]}]
                if key == 'girl_boss':
                    # Its cape is a rotated zero-thickness plane with artwork
                    # authored on both sides of the Java cube UV layout.
                    weapons[0]['outfit'][1]['preserveFlatFaces'] = True
            if key == 'striker':
                combat = combat_geometry['main']
                weapons = [{'outfit': [
                    armor_piece(combat, {'head'}, 'armor_layer1_overlay', [128, 64],
                                texture_folder='combat'),
                    armor_piece(combat, {'body', 'right_arm', 'left_arm'},
                                'armor_layer1_overlay', [128, 64],
                                texture_folder='combat'),
                ]}]
            full_outfits = {
                'forsaken_set': ('forsaken', 128, [64, 32]),
                'companion_leader_s1': ('companion10', 128, [128, 128]),
                'dylan_vip': ('dylans_suit', 256, [64, 64]),
            }
            if key in full_outfits:
                folder, main_size, leggings_size = full_outfits[key]
                geometry = batch_armor[key]
                outfit = {'outfit': [
                    armor_piece(geometry['main'], {'head'},
                                'armor_layer1_overlay', [main_size, main_size],
                                texture_folder=folder),
                    armor_piece(geometry['main'], {'body', 'right_arm', 'left_arm'},
                                'armor_layer1_overlay', [main_size, main_size],
                                texture_folder=folder),
                    armor_piece(geometry['leggings'], {'body', 'right_leg', 'left_leg', 'belt'},
                                'armor_layer2_overlay', leggings_size,
                                texture_folder=folder),
                    armor_piece(geometry['main'], {'right_leg', 'left_leg'},
                                'armor_layer1_overlay', [main_size, main_size],
                                texture_folder=folder),
                ]}
                weapons = [outfit] + weapons
                if key == 'dylan_vip':
                    chestpiece = outfit['outfit'][1]
                    chestpiece['preserveFlatFaces'] = True
                    chestpiece['animations'] = {
                        'WingLeft': {'oscillations': {
                            'x': {'offset': 0.08726647, 'amplitude': 0.08726647, 'speed': 1},
                            'y': {'offset': 0.2617994, 'amplitude': 0.2617994, 'speed': 2},
                        }},
                        'WingRight': {'oscillations': {
                            'x': {'offset': 0.08726647, 'amplitude': 0.08726647, 'speed': 1},
                            'y': {'offset': -0.2617994, 'amplitude': -0.2617994, 'speed': 2},
                        }},
                    }
            if key == 'bat_chestplate_transmog':
                weapons = [armor_piece(
                    batch_armor[key]['main'], {'body', 'right_arm', 'left_arm'},
                    'armor_layer1_overlay', [128, 128],
                    texture_folder='bloodbane',
                )]
                weapons[0]['preserveFlatFaces'] = True
            if key == 'i85_royale_crown':
                weapons = [armor_piece(
                    batch_armor[key]['main'], {'head'},
                    'armor_layer1_overlay', [32, 32],
                    texture_folder='royale_crown',
                    preview_scale=0.6,
                )]
            if key == 'patreon_dweller_gear':
                geometry = patreon_geometry['dread_steps']
                weapons = [{'outfit': [armor_piece(
                    geometry['main'], {'right_leg', 'left_leg'},
                    'armor_layer1_overlay', [64, 64], texture_folder='dread_steps',
                )]}] + weapons
            if key == 'patreon_cheeser_gear':
                geometry = patreon_geometry['cheeser']
                weapons = [{'outfit': [
                    armor_piece(geometry['main'], {'head'}, 'armor_layer1_overlay',
                                [128, 128], texture_folder='darkcheesewarrior'),
                    armor_piece(geometry['main'], {'body', 'right_arm', 'left_arm'},
                                'armor_layer1_overlay', [128, 128],
                                texture_folder='darkcheesewarrior'),
                    armor_piece(geometry['leggings'], {'body', 'right_leg', 'left_leg'},
                                'armor_layer2_overlay', [64, 64],
                                texture_folder='darkcheesewarrior'),
                    armor_piece(geometry['main'], {'right_leg', 'left_leg'},
                                'armor_layer1_overlay', [128, 128],
                                texture_folder='darkcheesewarrior'),
                ]}] + weapons
            if key == 'patreon_goblin_gear':
                geometry = patreon_geometry['goblin']
                weapons = [{'outfit': [
                    armor_piece(geometry['main'], {'head'}, 'armor_layer1_overlay',
                                [128, 128], texture_folder='goblin'),
                    armor_piece(geometry['main'], {'body', 'right_arm', 'left_arm'},
                                'armor_layer1_overlay', [128, 128], texture_folder='goblin'),
                    armor_piece(geometry['leggings'], {'body', 'right_leg', 'left_leg'},
                                'armor_layer2_overlay', [64, 64], texture_folder='goblin'),
                    armor_piece(geometry['main'], {'right_leg', 'left_leg'},
                                'armor_layer1_overlay', [128, 128], texture_folder='goblin'),
                ]}, armor_piece(patreon_geometry['hoarders_harness']['main'],
                                {'body', 'right_arm', 'left_arm'},
                                'armor_layer1_overlay', [64, 64],
                                texture_folder='hoarders_harness')]
            if key == 'patreon_champion_gear':
                geometry = patreon_geometry['champion']
                weapons = [{'outfit': [
                    armor_piece(geometry['main'], {'head'}, 'armor_layer1_overlay',
                                [128, 128], texture_folder='champion'),
                    armor_piece(geometry['main'], {'body', 'right_arm', 'left_arm'},
                                'armor_layer1_overlay', [128, 128], texture_folder='champion'),
                    armor_piece(geometry['leggings'], {'body', 'right_leg', 'left_leg'},
                                'armor_layer2_overlay', [64, 64], texture_folder='champion'),
                    armor_piece(geometry['main'], {'right_leg', 'left_leg'},
                                'armor_layer1_overlay', [128, 128], texture_folder='champion'),
                ]}, armor_piece(patreon_geometry['triumphant_crown']['main'],
                                {'head'}, 'armor_layer1_overlay', [64, 64],
                                texture_folder='triumphant_crown')] + weapons
            name = key.replace('_', '-')
            bundles.append((name, {
                'kind': 'items',
                'label': ('Halloween 2025 Sword' if key == 'halloween_pumpkin_weapon'
                          else rewards[key]['label']),
                'models': weapons,
                'cycleItems': key.startswith('patreon_'),
            }))
            if key == 'halloween_pumpkin_weapon':
                # The Halloween 2025 reward combines the animated Bumbo
                # Pumpkini companion with the Haunted Dagger weapon model.
                catalog['halloween_pumpkin']['firstImageOnly'] = False
                catalog['halloween_pumpkin']['additionalModel'] = name
            # Weapon models remain extracted for isolated renderer development,
            # but are not published until their visuals match the reward art.
            if key in ('i85_mattress', 'golden_kappa', 'golden_club',
                       'terra_weapons', 'terra_offhands',
                       'iskall85_reddragon_axe', 'iskall85_reddragon_sword',
                       'i85_petal_splitter', 'i85_twin_blade',
                       'forsaken_axe', 'forsaken_sword',
                       'midnight_thorn', 'lamenting_mirror',
                       'nocturn_shield', 'arry_axe', 'never_ever',
                       'i85_100stream', 'nutcracker_wand',
                       'christmas_fireplace', 'lost_christmas_axe',
                       'buster_sword', 'i85_spring_set',
                       'i85_treasure_train', 'i85_server_bingos',
                       'iskall85_falcon_helmet',
                       'iskall85_falcon_chestplate',
                       'iskall85_ancient_scroll', 'doomslayer', 'sculk_set',
                       'essence_of_iskallium', 'hypefuse_scepter',
                       'green_christmas_hat', 'xmas_dayfour_chest',
                       'snowman_helmet', 'girl_boss', 'hellboy_head',
                       'retirement', 'terra_armor', 'striker',
                       'forsaken_set', 'halloween_magnet',
                       'bat_chestplate_transmog', 'bat_axe_transmog',
                       'i85_royale_crown', 'companion_leader_s1', 'dylan_vip',
                       'patreon_dweller_gear', 'patreon_cheeser_gear',
                       'patreon_goblin_gear', 'patreon_champion_gear'):
                catalog[key] = {'model': name, 'companion': False}
        (OUTPUT / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
        module = OUTPUT.parents[1] / 'js/features/reward-model-catalog.js'
        module.write_text('// Generated by scripts/reward-models/extract.py.\nexport default '
                          + json.dumps(catalog, indent=2) + ';\n', encoding='utf-8')
        for name, data in bundles:
            (OUTPUT / (name + '.json')).write_text(
                json.dumps(data, separators=(',', ':')), encoding='utf-8')
            print('Extracted', name)


if __name__ == '__main__':
    extract(sys.argv[1])
