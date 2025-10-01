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

    const { rewards, sets } = await fetchRewards(formattedId);
    const tier = await fetchTiers(formattedId);

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
    head: player.avatar || `https://mc-heads.net/avatar/${rawId}`
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
