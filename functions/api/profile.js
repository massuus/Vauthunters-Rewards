const PLAYERDB_PROFILE_URL = "https://playerdb.co/api/player/minecraft/";
const REWARDS_URL = "https://rewards.vaulthunters.gg/rewards?minecraft=";
const TIER_URL = "https://api.vaulthunters.gg/users/reward?uuid=";

const INVALID_UUID_LENGTH = 32;
const REQUEST_HEADERS = {
  "user-agent": "Vauthunters Rewards/1.0 (+https://vh-rewards.massuus.com)",
  accept: "application/json"
};

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const username = (url.searchParams.get("username") || "").trim();

  if (!username) {
    return json({ error: "Username query parameter is required." }, 400);
  }

  // Simple mock mode to aid local testing: /api/profile?username=...&mock=1
  if (url.searchParams.has("mock")) {
    const mockName = username || "Mock User";
    return json({
      id: "mock",
      name: mockName,
      head: "https://mc-heads.net/avatar/f00538241a8649c4a5199ba93a40ddcf",
      "rewards": {
        "the_vault:shield": [
            "the_vault:gear/shield/golden_kappa",
            "the_vault:gear/shield/spring_shield",
            "the_vault:gear/shield/dylans_protector",
            "the_vault:gear/shield/mattress"
        ],
        "the_vault:boots": [
            "the_vault:gear/armor/companion10/boots",
            "the_vault:gear/armor/flowery_madness/boots",
            "the_vault:gear/armor/dylans_suit/boots"
        ],
        "the_vault:helmet": [
            "the_vault:gear/armor/companion10/helmet",
            "the_vault:gear/armor/royale_crown/helmet",
            "the_vault:gear/armor/flowery_madness/helmet",
            "the_vault:gear/armor/dylans_suit/helmet",
            "the_vault:gear/armor/falcon/helmet"
        ],
        "the_vault:leggings": [
            "the_vault:gear/armor/companion10/leggings",
            "the_vault:gear/armor/flowery_madness/leggings",
            "the_vault:gear/armor/dylans_suit/leggings"
        ],
        "the_vault:chestplate": [
            "the_vault:gear/armor/companion10/chestplate",
            "the_vault:gear/armor/flowery_madness/chestplate",
            "the_vault:gear/armor/five_in_a_row_guard/chestplate",
            "the_vault:gear/armor/dylans_suit/chestplate",
            "the_vault:gear/armor/falcon/chestplate"
        ],
        "the_vault:axe": [
            "the_vault:gear/axe/spring_axe",
            "the_vault:gear/axe/dylans_cleaver",
            "the_vault:gear/axe/reddragon_axe",
            "the_vault:gear/axe/petal_splitter"
        ],
        "the_vault:wand": [
            "the_vault:gear/wand/spring_wand",
            "the_vault:gear/wand/dylans_magic_stick"
        ],
        "the_vault:focus": [
            "the_vault:gear/focus/spring_focus",
            "the_vault:gear/focus/tiny_treasure_train",
            "the_vault:gear/focus/dylans_book",
            "the_vault:gear/focus/ancient_scroll"
        ],
        "the_vault:sword": [
            "the_vault:gear/sword/spring_sword",
            "the_vault:gear/sword/dylans_blade",
            "the_vault:gear/sword/twin_blade",
            "the_vault:gear/sword/reddragon_sword"
        ],
        "the_vault:magnet": [
            "the_vault:gear/magnets/spring_magnet"
        ],
        "the_vault:companion": [
            "the_vault:baby_creeper_gold",
            "the_vault:baby_creeper_pog",
            "the_vault:dino",
            "the_vault:dylan_penguin"
        ]
    },
      // all sets unlocked in the set-art.json
      sets: [
        "golden_kappa",
        "companion_leader_s1",
        "i85_royale_crown",
        "i85_spring_set",
        "i85_treasure_train",
        "i85_server_bingos",
        "dylan_vip",
        "baby_creeper_gold",
        "baby_creeper_pog",
        "iskall85_falcon_helmet",
        "iskall85_falcon_chestplate",
        "iskall85_reddragon_axe",
        "iskall85_ancient_scroll",
        "i85_companion_dino",
        "i85_dylan_penguin",
        "i85_mattress",
        "i85_petal_splitter",
        "i85_twin_blade",
        "iskall85_reddragon_sword"
      ],
      tier: []
    });
  }

  if (url.searchParams.has('mock')) {
    return json({
      id: 'mock',
      name: 'Mock User',
      head: 'https://mc-heads.net/avatar/f00538241a8649c4a5199ba93a40ddcf',
      rewards: {
      shield: ['Golden Kappa', 'Spring Shield'],
      helmet: ['companion10', 'royale_crown'],
      chestplate: ['dylans_suit'],
      magnets: ['spring_magnet']
    },
      sets: ['Spring Set', 'Dylan\'s Set'],
      tier: []
    });
  }

  try {
    const profile = await fetchProfile(username);

    if (!profile) {
      return json({ error: "Player not found." }, 404);
    }

    const { rawId, name, head } = profile;
    const formattedId = formatUuid(rawId);

    if (!rawId || !formattedId) {
      return json({ error: "Unable to resolve player UUID." }, 502);
    }

    const [rewardsData, tier] = await Promise.all([
      fetchRewards(formattedId),
      fetchTiers(formattedId)
    ]);

    const { rewards, sets } = rewardsData;

    return json({
      id: rawId,
      name,
      head,
      rewards,
      sets,
      tier
    });
  } catch (error) {
    console.error("Profile lookup error:", error);
    return json({
      error: "Failed to retrieve player data.",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

async function fetchProfile(username) {
  const response = await fetch(`${PLAYERDB_PROFILE_URL}${encodeURIComponent(username)}`, {
    headers: REQUEST_HEADERS
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Profile API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data?.success || !data?.data?.player?.raw_id) {
    return null;
  }

  const player = data.data.player;
  const rawId = player.raw_id;

  if (typeof rawId !== "string" || rawId.length !== INVALID_UUID_LENGTH) {
    return null;
  }

  return {
    rawId,
    name: player.username || username,
    head: `https://mc-heads.net/avatar/${rawId}`
  };
}

function formatUuid(hexId) {
  if (!hexId || hexId.length !== INVALID_UUID_LENGTH) {
    return null;
  }

  return `${hexId.slice(0, 8)}-${hexId.slice(8, 12)}-${hexId.slice(12, 16)}-${hexId.slice(16, 20)}-${hexId.slice(20)}`;
}

async function fetchRewards(formattedId) {
  try {
    const response = await fetch(`${REWARDS_URL}${encodeURIComponent(formattedId)}`, {
      headers: REQUEST_HEADERS
    });

    if (response.status === 404) {
      return { rewards: {}, sets: [] };
    }

    if (!response.ok) {
      console.error("Rewards API error status:", response.status);
      return { rewards: {}, sets: [] };
    }

    const data = await response.json();
    const rewards = Array.isArray(data.rewards) ? {} : data.rewards || {};
    const sets = Array.isArray(data.sets) ? data.sets : data.sets || [];

    return { rewards, sets };
  } catch (error) {
    console.error("Rewards fetch error:", error);
    return { rewards: {}, sets: [] };
  }
}

async function fetchTiers(formattedId) {
  try {
    const response = await fetch(`${TIER_URL}${encodeURIComponent(formattedId)}`, {
      headers: REQUEST_HEADERS
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      console.error("Tier API error status:", response.status);
      return [];
    }

    const data = await response.json();
    return Array.isArray(data.tier) ? data.tier : [];
  } catch (error) {
    console.error("Tier fetch error:", error);
    return [];
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}
