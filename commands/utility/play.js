const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const ytdl = require('ytdl-core-discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Plays a song.')
    .addStringOption((option) =>
      option.setName('input').setDescription('The YouTube URL to play').setRequired(true)
    ),
  async execute(interaction) {
    const input = interaction.options.getString('input');
    if (!ytdl.validateURL(input)) {
      return interaction.reply('Please provide a valid YouTube URL.');
    }

    // Get the user's voice channel
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply('You need to be in a voice channel to play music.');
    }

    // Join the voice channel
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    // Create an audio player
    const player = createAudioPlayer();

    // Handle connection state changes
    connection.on(VoiceConnectionStatus.Ready, () => {
      console.log('The bot has connected to the channel!');
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Seems to be reconnecting to a new channel - ignore disconnect
      } catch (error) {
        // Seems to be a real disconnect which SHOULDN'T be recovered from
        connection.destroy();
      }
    });

    // Create a stream from the YouTube URL
    let resource;
    try {
      const stream = await ytdl(input, { filter: 'audioonly' });
      resource = createAudioResource(stream);
    } catch (error) {
      console.error(`Error creating audio resource: ${error.message}`);
      return interaction.reply('There was an error processing the YouTube URL.');
    }

    // Play the stream
    player.play(resource);

    // Subscribe the connection to the audio player
    const subscription = connection.subscribe(player);

    if (subscription) {
      console.log('Subscription to the player is successful!');
    } else {
      console.log('Failed to subscribe to the player.');
    }

    // Handle player events
    player.on(AudioPlayerStatus.Playing, () => {
      console.log('The audio player has started playing!');
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log('The audio player is idle.');
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    });

    player.on('error', (error) => {
      console.error(`Error: ${error.message}`);
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    });

    await interaction.reply(`Now playing: ${input}`);
  },
};
