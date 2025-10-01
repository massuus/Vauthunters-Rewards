const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const MOJANG_PROFILE_URL = 'https://api.mojang.com/users/profiles/minecraft/';
const REWARDS_URL = 'https://rewards.vaulthunters.gg/rewards?minecraft=';
const TIER_URL = 'https://api.vaulthunters.gg/users/reward?uuid=';

app.use(express.static('public'));

// Convert Mojang UUID without dashes into canonical dashed format
function formatUuid(hexId) {
  if (!hexId || hexId.length !== 32) {
    return null;
  }

  return `${hexId.slice(0, 8)}-${hexId.slice(8, 12)}-${hexId.slice(12, 16)}-${hexId.slice(16, 20)}-${hexId.slice(20)}`;
}

app.get('/api/profile', async (req, res) => {
  const username = (req.query.username || '').trim();

  if (!username) {
    return res.status(400).json({ error: 'Username query parameter is required.' });
  }

  try {
    const mojangResponse = await fetch(`${MOJANG_PROFILE_URL}${encodeURIComponent(username)}`);

    if ([204, 404].includes(mojangResponse.status)) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    if (mojangResponse.status === 400) {
      return res.status(400).json({ error: 'Invalid Minecraft username.' });
    }

    if (!mojangResponse.ok) {
      throw new Error(`Mojang API error: ${mojangResponse.status}`);
    }

    const mojangData = await mojangResponse.json();
    const rawId = mojangData.id;
    const formattedId = formatUuid(rawId);

    if (!rawId || !formattedId) {
      throw new Error('Invalid Mojang response: missing UUID.');
    }

    const headUrl = `https://mc-heads.net/avatar/${rawId}`;
    const { rewards, sets } = await fetchRewards(formattedId);
    const tier = await fetchTiers(formattedId);

    res.json({
      id: rawId,
      name: mojangData.name,
      head: headUrl,
      rewards,
      sets,
      tier
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve player data.' });
  }
});

async function fetchRewards(formattedId) {
  try {
    const response = await fetch(`${REWARDS_URL}${encodeURIComponent(formattedId)}`);

    if (response.status === 404) {
      return { rewards: {}, sets: [] };
    }

    if (!response.ok) {
      throw new Error(`Rewards API error: ${response.status}`);
    }

    const data = await response.json();
    const rewards = Array.isArray(data.rewards) ? {} : data.rewards || {};
    const sets = Array.isArray(data.sets) ? data.sets : data.sets || [];

    return { rewards, sets };
  } catch (error) {
    console.error(error);
    return { rewards: {}, sets: [] };
  }
}

async function fetchTiers(formattedId) {
  try {
    const response = await fetch(`${TIER_URL}${encodeURIComponent(formattedId)}`);

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`Tier API error: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.tier) ? data.tier : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
