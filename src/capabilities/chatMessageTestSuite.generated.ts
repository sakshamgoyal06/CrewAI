/** AUTO-GENERATED — do not edit. Run: npx tsx scripts/dev/generate-chat-message-test-suite.mts */
import type { ChatMessageTestCase, ChatTestSuiteMeta } from "./chatMessageTestSuite.types.js";

export const CHAT_MESSAGE_TEST_SUITE_META: ChatTestSuiteMeta = {
  "generatedAt": "2026-08-13",
  "totalCases": 1000,
  "bySource": {
    "real_chat": 279,
    "catalog": 152,
    "adversarial": 6,
    "synthetic": 92,
    "variation": 471
  },
  "byCategory": {
    "general_youtube": 48,
    "happiness_media": 21,
    "follow_up": 14,
    "general_conversation": 117,
    "health_fitness": 80,
    "general_day": 13,
    "wealth": 79,
    "health_meal_plan": 106,
    "general_tools": 13,
    "wisdom": 74,
    "health_meal": 14,
    "health_meal_log": 76,
    "health_meal_history": 47,
    "health_meal_targets": 21,
    "health_hevy_write": 14,
    "health_nutrition": 14,
    "health_alternates": 14,
    "health_energy": 14,
    "health_journal": 17,
    "health_long_term": 14,
    "happiness": 93,
    "general_calendar": 9,
    "general_day_overview": 8,
    "general_lists": 19,
    "general_lifeos": 13,
    "general_notion": 3,
    "general_event_log": 10,
    "general_proactive": 9,
    "general_journal": 2,
    "general_zerodha": 1,
    "general_pillar_consultation": 3,
    "adversarial_ambiguity": 8,
    "general_connect": 2,
    "edge_typos": 10
  },
  "realChatCount": 279
};

export const CHAT_MESSAGE_TEST_SUITE: ChatMessageTestCase[] = [
  {
    "id": "cmt-0001",
    "message": "Connect YouTube",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0002",
    "message": "Connect youtube now",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0003",
    "message": "Connect Google",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0004",
    "message": "Test my yt music connection. What can you do for me there?",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0005",
    "message": "Search youtube and share learning videos about 2007 recession",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0006",
    "message": "Add 2,3, 6 in my watchlist for youtube",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0007",
    "message": "Create 2 empty playlists \"Wealth\" and \"wisdom\". Add the above videos in wisdom playlist",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0008",
    "message": "Search youtube for the best explainers on credit cycles, leverage, and 2008 crises - add thr\nE tip 5 to my wealth playlist",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0009",
    "message": "Yes",
    "source": "real_chat",
    "category": "follow_up",
    "observedIntent": null,
    "requiresPriorTurn": true,
    "issueTags": [
      "needs_prior_turn"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0010",
    "message": "Yes add both and remove the 36 second short",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0011",
    "message": "Find my high energy workou youtube music playlist, and add 5 pop songs to that that are new and fit for good workout",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "playlist_name_confusion",
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0012",
    "message": "Based on the mixed sessions for ai, what all is remaining to implement ai bot",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0013",
    "message": "No read the agenda of past ai sessions in calendar",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0014",
    "message": "Cant you check using calendar connections?",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "calendar_not_read"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0015",
    "message": "You are not looking at calendar",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "calendar_not_read"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0016",
    "message": "July 31 has an agent",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0017",
    "message": "Check agenda more for these events",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0018",
    "message": "Log that all this is done now",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0019",
    "message": "Now setup AI sessions for the remaining week on monday, wednesday, and friday 7:15 pm to 8:15 pm.\n\nFor AI next steps are setting up my watchlist, movie list, travel list, poem list, readlist and etc to have repository for recommendations.\n\nThen need to add connections to kite and zerodha for investment purposes. And explore AA connection if possible.\n\nThen refactor entire project once to cleanup any redundancies and set up core vs user structure cleanly. So we dont leave any legacy errors.\n\nThen we will need to understand how logging is working in magnus. Meaning when user says log something or do something how and where does data and changes flow. Then we need to add log reminders on magnus.\n\nThen we need to work on fixing the daily / weekly / monthly rythm and progress checks.\n\nAnd then we will finally do a reintegration of everything to double on the core philosophy of 4 pillars and their goals so every conversation works smoothly, and magnus truly becomes the chief of staff",
    "source": "real_chat",
    "category": "wealth",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0020",
    "message": "Create the sessions on next mon wed fri similarly to cover up the remaining roadmap.\n\nPre write agendas on all these events and set notification for 10 minute before with pn",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0021",
    "message": "Morning brief",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0022",
    "message": "Can you help build my meal plan for the week?",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0023",
    "message": "Fat and weight loss",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0024",
    "message": "I eat normal indian foods. I want to move to healthy weightloss high protein low calorie diet",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0025",
    "message": "Breakfast 10 am, lunch 3 pm, dinner 9 pm",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0026",
    "message": "In non veg only boneless chicken. Avoid lauki.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0027",
    "message": "So build my meal plan for the week",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0028",
    "message": "A) my birthday is on 8th august, saturday. How did you know my burthday?\nB) what is full build day?\nC) I can eat chicken only in lunch on weekdays.\nD) in evening i want to try healthy indian as well as healthy gourmet options like hommeade burrito bowl etc.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0029",
    "message": "First rebuild the plan and then add snack option. Also give calorie and protein numbers",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0030",
    "message": "Give me the remaining message",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0031",
    "message": "Whats for gym today?",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0032",
    "message": "Find a good YouTube video to watch for 20 mins treadmill",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0033",
    "message": "Search for highly rated and viewed videos about distillation of good books",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0034",
    "message": "Add psychology of money and good to great both in wisdom playlist",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0035",
    "message": "What are the next things I have to build for magnus?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0036",
    "message": "Now in my wisdom playlist, can you add videos that help me learn AI concepts that help me achieve the best version of Magnus.\n\nI dont like videos where there is only speech or lectures. I like infographics and animation. Search accordingly, and the time should be 15-30 mins",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0037",
    "message": "Yes, add RAG and vector databaes",
    "source": "real_chat",
    "category": "follow_up",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0038",
    "message": "Yes, go ahead",
    "source": "real_chat",
    "category": "follow_up",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0039",
    "message": "Remove any videos that are in hindi.  3blue1brown is in hindi, find something else. First do a web search for the right videos and then find them on YouTube and add. Empty the wisdom playlist and recreate in order of curriculum needs",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0040",
    "message": "Remove any videos that are in hindi.  3blue1brown is in hindi, find something else.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0041",
    "message": "Empty the wisdom playlist and recreate in order of curriculum needs",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0042",
    "message": "Move wealth and money related videos in wealth playlist.",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0043",
    "message": "Check my wisdom, wealth, and magnus playlists in youtube.",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0044",
    "message": "Now remove duplicated video in wisdom and wealth playlists",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0045",
    "message": "Check my wisdom playlist, and remove duplicated items",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0046",
    "message": "Connect zerodha",
    "source": "real_chat",
    "category": "wealth",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0047",
    "message": "Can you check my holdings right now?",
    "source": "real_chat",
    "category": "wealth",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0048",
    "message": "Can you check when i bought this elss fund and when is the 3 year getting over for your",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0049",
    "message": "Connect fi",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0050",
    "message": "connect notion",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0051",
    "message": "Lets mirror the 10th list too",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0052",
    "message": "List catalog q",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0053",
    "message": "Whats on my watchlist?",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0054",
    "message": "Sleepless in seattle\nThr kings speech\nAamis\n\nAdd to my watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0055",
    "message": "Whats in my watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0056",
    "message": "Remind me to buy tomatoes this Sunday",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0057",
    "message": "Whats on my to-do list",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0058",
    "message": "Sunday i need to go shopping.\n\nList - bhindi, kela, amrud, imli, tissue roll, bindi, kangan, swimming goggles",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0059",
    "message": "Sync supabase to notion",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0060",
    "message": "Whats for today",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0061",
    "message": "What should i do today",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0062",
    "message": "I finished yesterday ao session. It went great. Added zerodha and notion integrations",
    "source": "real_chat",
    "category": "wealth",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0063",
    "message": "What about gym today?",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0064",
    "message": "Lets do push A",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0065",
    "message": "No let's do the push A sheet today instead of pull A",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0066",
    "message": "Your calculation is wrong it was 9 pm to 1am",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0067",
    "message": "Yes, 9:45 to 11 gym time.\n\n12 ill reach office, 12-3 first block, 3-5:30 second block with lunch and then leave for swimming. Then return home and 9-10 AI work, focusing on end to end architecture review and cleanup, and diagram",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0068",
    "message": "What wisdom video I should watch with treadmill.\n\nI am doing cardio and abs and not push A",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0069",
    "message": "No, videos from my wisdom playlist",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0070",
    "message": "Awesome, i watched all 3 while on treadmill!",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0071",
    "message": "I have logged my hevy workout for today, check it out",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0072",
    "message": "I will watch Michael on Friday when celebrating weekend. Load it before only on streamio, get all set and watch",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0073",
    "message": "No add it to my watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0074",
    "message": "What was the agenda for tonights ai session",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0075",
    "message": "Prepare my tomorrow's calendar.",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0076",
    "message": "Add pull A tomorrow, and then add work blocks between 10 to 6\n\nFor ai, kite and zerodha connections are already there. What is the next thing we need to do for magnus",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0077",
    "message": "Add building notifications for magnus and inactivity trigger for tomorrow.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0078",
    "message": "Can you also create a new list for me, where i track my ideas and todos for magnus? They will come in handy for my ai learning plan",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0079",
    "message": "Great! Now in this also add-\n1) users aim and goal disambiguation. \n2) Long term and short term target setting\n3) basically work on magnus core philosophy being implemented in user experience\n4) refine logging, it should turn into a user map for magnus to mark deviation from goal\n5) add detection of missed commitments or plan and correcting course. Finding hidden behaviour\n6) adding journal notifications and making logging fun and important for the user",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0080",
    "message": "Great! Lets also add finally building a thorough onboarding journey for new users",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0081",
    "message": "what's on my watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0082",
    "message": "No i did yesterdays session. I did architecture review and cleanup",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0083",
    "message": "Its late now. I will get late for office if I leave now. Plus i feel tired, ill skip pull a today",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0084",
    "message": "Lets do Pull A tomorrow 9 only, but I need to wake up at 7 at all cost. How do i do that",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0085",
    "message": "What else should I do to ensure I don't miss the gym sessions",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0086",
    "message": "Log today's miss if. Kt already done. Thanks, this was helpful.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0087",
    "message": "In my AI plan list, also add adding a linkedin connection to boost my job prospect. Magnus should be able to search relevant jobs for me, help me prepare for jobs, update / recommend changes to my linkedin profile and activity, and should help me refine my resume.\n\nIf i go in job hunt mode, the architecture should support me to work consistently and regularly, prepare better and evaluate options better, and land the job.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0088",
    "message": "No. But what are my current goals?",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0089",
    "message": "What does your context and architecture says about how should i structure goals, north star, and misogi. What should I have with what timeline? I dont mean the exact goal, but like what kind of short goal or long goal etc",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0090",
    "message": "Okay, so my misogi this year, that made this year legendry was getting married. Does that fit the misogi definition?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0091",
    "message": "Help me set my goals.",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0092",
    "message": "Health - I want to learn swimming. And I want to lose enough weight so my old shirts fit me again. They used to fit when i was 103 kgs, i am at 115 now.\n\nWisdom - shipping magnus to beta users by november. Get feedback and decide If i keep magnus as my own assistant or roll out as a product\n\nWealth - i am employed right now. I work for slice bank. I am not building any company right now. My wealth goal is to have 12 lakh in liquid savings with me. Currently its at 7 lakh.\n\nHappiness - travel more. I have a thailand honeymoon planned for in september end.",
    "source": "real_chat",
    "category": "wealth",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0093",
    "message": "You are right, 83k is too high. Lets save 30k a month personally.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0094",
    "message": "Go with 1.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0095",
    "message": "In my ai planning list, add a priority item as meal planning and logging for health pillar. Its very important.\n\nAnd in my general todo list, add an item to sort out joint savings by next weekend at all cost.\n\nAlso, 8th august is my birthday",
    "source": "real_chat",
    "category": "wealth",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0096",
    "message": "I will spend Sunday (day after my birthday), introspecting my life and time spend so far, and reading some book. \n\nSaturday my wife has already planned things for me",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0097",
    "message": "Die with zero sounds good, add that to my readlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0098",
    "message": "Why does my today's calendar have the same events duplicated?",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0099",
    "message": "Yes remove the duplicates",
    "source": "real_chat",
    "category": "follow_up",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0100",
    "message": "In my guitar practice playlist, add the night we met.",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0101",
    "message": "No, in my list on notion, is there a music / guitar list?",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0102",
    "message": "So lets reframe music list as guitar learning list. In that we will add the songs i want to learn, link to its chords and music sheet, and any youtube video link for learning.\n\nAlso create a new youtube playlist where i will keep the song learning videos.",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0103",
    "message": "Thanks!",
    "source": "real_chat",
    "category": "follow_up",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0104",
    "message": "Add invite to my watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0105",
    "message": "Remind me to call Nishit at 8PM today",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0106",
    "message": "I had a great swimming session. Had a good one yesterday too but today was really good. I learned how to kick and go beyond, and i backfloated without breaking for 15 mins.....it was reallly really peaceful and drove dopamine",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0107",
    "message": "Add this to the relevant logs",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0108",
    "message": "In AI task list, add defining joy tank management",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0109",
    "message": "In the notion list there is an ai task plan, search and add thete",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0110",
    "message": "What other items are there in magnus ideas and todos",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0111",
    "message": "Cool. This is good. What other lists do we have which we are maintaining",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0112",
    "message": "Cool. This is good",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0113",
    "message": "Now today, we had a 50 minute swimming sesion. In this 10 minutes we did floating, next 25 mins we did kicking and swimming with kicking, and then 15 mins back floating\n\n\nHow much calories did i burn?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0114",
    "message": "I didnt do AI session today because i spent time teaching my wife sql. I had fun.\n\nI have kept my gym clothes up, set alarm for 6 30 and 7 and keeping it on a desk away so i have to get out of bed move out and turn it off. See you tomorrow. Pull A here i come",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0115",
    "message": "I gave you the reason why i did not do ai session yesterday. \n\nAlso, gym session i have been logging decently earlier. I'd like to continue morning slot only",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0116",
    "message": "I am done with the workout. Read hevy, review, and log",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0117",
    "message": "No, log that i did the workout in my daily chrck ins.\n\nAlso we scheduled pull A only today right since we missed it yesterday?",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0118",
    "message": "I updated the workout, check again now. Also did you notice treadmill?",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0119",
    "message": "So I was able to do treadmill because i was watching LLM video from my wisdom playlist. From youtube, can you check which video i watched tofay?",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0120",
    "message": "Add getting yourube watch history in my magnus ideas list",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0121",
    "message": "https://youtu.be/NLOBYtfdxuM?si=LC0ErzXtfWLMVILi\n\nI watched this video. This was really good. Can you add the next 5 videos from this channel regarding LLMs in wisdom playlist. I think there will be a sequence of videos in the channel, search that and add in sequence",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0122",
    "message": "You picked the wrong channel. Delete the above videos from the playlist. The channel name is under the hood",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0123",
    "message": "Yes that's better. Remove other videos too from this playlist. Only keep videos from under the hood",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0124",
    "message": "Add a reminder to message bharadwaj to get my brother's surgical stuff on the weekend. Remind me on saturday 12 pm",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0125",
    "message": "Remind me on sunday 9:30 AM to drop my bike for servicing",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0126",
    "message": "Die with zero just got delivered",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0127",
    "message": "What did you mark as in progress?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0128",
    "message": "Whats on the ai practice agenda today",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0129",
    "message": "Check today's calendar and magnus ideas and tell me",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0130",
    "message": "There were other todos. Check notion list and confirm",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0131",
    "message": "Nooo check magnus ideas in notion, there were more items there",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0132",
    "message": "What do i need to do tomorrow",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0133",
    "message": "Gym is push A\nAI will be 8:30 onwards",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0134",
    "message": "I watched the notebook today with my wife. I found it okay, one classic off my watchlist.",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0135",
    "message": "What are my goals",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0136",
    "message": "I completed yesterday's ai session. \nalso i went to gym yesterday and earlier too.",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0137",
    "message": "No push a is not done yet. Pull a only was done yesterday",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0138",
    "message": "No i did the pull A session on 6th instead of 5th",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0139",
    "message": "Add musafir cafe to my watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0140",
    "message": "How was my todays gym session",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0141",
    "message": "Pull data from hevy",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0142",
    "message": "How was my gym session today",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0143",
    "message": "Had a good swimming session",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0144",
    "message": "Not doing ai learning. I am going to watch Michael",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0145",
    "message": "Technique is getting much better now",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0146",
    "message": "I meant swimming technique",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0147",
    "message": "Yesterday, 7th was a good day. I did gym, good work, great swim session, relaxed, ate, watched michael - a new movie for me and wife.\n\nAnd my wife celebrated my birthday with a beautiful treasure end. It was beautiful, romantic, and truly surprisign. I love her. I cant believe the love i looked for all my life, has walked into it so easily. I feel like my prayers have been answered",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0148",
    "message": "Create this as a journal entry",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0149",
    "message": "I did AI practice on 6th too. Is it not logged?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0150",
    "message": "At 9 pm only on 6th i did ai session",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0151",
    "message": "Done, messaged bhardwaj",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0152",
    "message": "Add wicked game and chhaiya chhaiya (2 different songs) in my guitar learning music list. Find the youtube videos for this to learn on guitar and add on my youtube guitar learning playlist too",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0153",
    "message": "Remind me to call bansal tomorrow at 6 PM. Add to calendar",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0154",
    "message": "What was my last workout. How was it and what did i do",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0155",
    "message": "In catan, what is the order in which the steps should be done. And can dev card be played before turn",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0156",
    "message": "Add a reminder 6 months from today on the 1st of that month, that my bike's 4th service is due.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0157",
    "message": "What next items do i have, to build for magnus?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0158",
    "message": "[meal photo]",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0159",
    "message": "The second curry is also chana masala. And there is no dip. Only the curry and rice",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0160",
    "message": "Tomorrow is Monday. I want to make meal plan for next 2 weeks. Help me make the plan",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0161",
    "message": "cancel planning",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0162",
    "message": "Goal is to get used to home diet and a good active routine. Not eat out or snack a lot. Dedicated one meal for eating out, one for ordering, and one for cooking special.\n\nMeals need to be simple, vegetarian, indian regular meals. But it should be protein + carbs + fiber. Eggs, protein whey, and paneer for fiber. Eggs only omelette or sunny side up.\n\nCalories 2400 max. Protein 80 gms is good, but lower is also fine for 2 weeks.\n\nFor breakfast and lunch, my cook cooks. Dinner my wife, or both of us if planning something special. \n\n3 meals. Keep desi vegetables and curries and staple option in \n\nTemplate i want each day plan for week 1 first, and then week 2",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0163",
    "message": "Why did you make it lauki free menu",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0164",
    "message": "No, lauki was on my avoid list. Remove lauki, keep the original plan",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0165",
    "message": "Lock this in",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0166",
    "message": "Save plan",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0167",
    "message": "Whats my meal plan for tomorrow",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "ambiguous_routing"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0168",
    "message": "Whats my meal plan tomorrow?",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0169",
    "message": "Should i swap rajma for chhole?",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0170",
    "message": "Whats the plan for tomorrow?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0171",
    "message": "I mean, what does my whole day look like tomorrow",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0172",
    "message": "So what does my tomorrow's day look like",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0173",
    "message": "What does my day look like tomorrow",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0174",
    "message": "Move AI session from 7:15 to 9 pm tomorrow",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0175",
    "message": "Switch lunch and dinner planned meals for tomorrow",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0176",
    "message": "What is the amount of poha i have to eat tomorrow",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0177",
    "message": "Whats the gym plan tomorrow?",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0178",
    "message": "Add this to my calendar. And suggest the youtube video for treadmill",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0179",
    "message": "Find a YouTube video animated explaining the book die with zero",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0180",
    "message": "https://youtu.be/GbhjusSbXcY?si=5Yq2f20ZKoBbqQ3D\n\nAdd this to my wisdom list",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0181",
    "message": "My wisdom youtube list",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0182",
    "message": "https://youtube.com/@antidote_thechannel?si=SHl5jIrqL4hxBea1\n\nAdd all videos of this channel in wisdom youtube playlist",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0183",
    "message": "Yes, add in magnus ideas.",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0184",
    "message": "https://youtu.be/bHpLERAfY-w?si=9QH3zOIkULnYloHh\n\nThis is the die by zero summary I'll read tomorrow. Add to my wisdom youtube playlist",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0185",
    "message": "Whats the agenda for AI session tomorrow?",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0186",
    "message": "See you tomorrow",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0187",
    "message": "I dropped the bike, but haven't picked it up",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0188",
    "message": "Ill pick up today, not needed in calendar",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0189",
    "message": "What does my day look like today",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0190",
    "message": "For today's meal, switch lunch and dinner",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0191",
    "message": "Today breakfast ill eat poha and sunny side up egg. Lunch will be moong dal and aloo palak. Dinner will aloo sabji and methi paratha",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0192",
    "message": "Lunch will have 2 rotis too",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0193",
    "message": "So whats my todays meal plan?",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0194",
    "message": "Dinner?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0195",
    "message": "So give me today and tomorrow's complete meal plan.",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0196",
    "message": "Share me a shopping list for ingredients, based on this weeks meal plan",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0197",
    "message": "I am taking a leave from woek today. Will go for getting bike and gym in afternoon. I will use this time to clean up and organize my personal space today",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0198",
    "message": "https://www.instagram.com/reel/Dbx35NWtGEm/?igsh=NWtlcTU5a3M1aWt3\n\nCan you add these books in my readlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0199",
    "message": "These are the books",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0200",
    "message": "Add 3 months from today to put bike for 3rd service",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0201",
    "message": "In this event and reminder, add the details to a) 2nd service was missed and done on 3rd and i paid 250 for it. So for 3rd i was asked to come early\nB) leave helmet and key at the center only",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0202",
    "message": "The bill for this service will be kept in my bookshelf. Add that in agenda and reminder too",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0203",
    "message": "Can you add these books to my readlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0204",
    "message": "I missed the gym session today. Postponing it made me forget and then by 4 PM i thought that since I have to go to swimming ill be sore",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0205",
    "message": "Remind me on friday to get done the following at 12 PM. Pest control, refrigerator service, toilet fix, get ghewar, visit mandir,",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0206",
    "message": "Add to calendar also",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0207",
    "message": "It's time i switch jobs.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0208",
    "message": "Start a job search project",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0209",
    "message": "Lock it in.",
    "source": "real_chat",
    "category": "general_tools",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0210",
    "message": "I don't want to search jobs anymore",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0211",
    "message": "I started the search to see what's our there. But decided it's better to stay in my current firm since i have more knowledge and power here and will get a better role here soon",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0212",
    "message": "What does my day fir tomorrow look like",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0213",
    "message": "Abandon job search. \n\nLets focus on tomorrow's day. Add my gym plan, meal plan, and work slots",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0214",
    "message": "You know my routine. Whats the gym plan for tomorrow",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0215",
    "message": "10:30 - 1 -> close finance and ir queries and talk to payments team analysts and also post growth focus message. \n\n1-6 -> close your task list in cafeteria",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0216",
    "message": "10:30 - 1 -> close finance and ir queries and talk to payments team analysts and also post growth focus message. \n\n1-6 -> close your task list in cafeteria\n\nThese are the two work blocks we need to set on my calendar for tomorrow. Along with the agenda shared",
    "source": "real_chat",
    "category": "general_day",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0217",
    "message": "Whats there tomorrow for gym and meals",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0218",
    "message": "I did swimming today. An okay session but learnt back floating. Having trouble with landing.\n\n\nAlso for tomorrows calendar, add gym from morning 7:30 AM. What's the plan for gym tomorrow?",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0219",
    "message": "Yes lets queue the podcast. Pick something in my wisdom playlist",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0220",
    "message": "Lets go with die with zero",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0221",
    "message": "I picked up bike yesterday. And i cleaned home partly, my middle cupboard clean up is remaining",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0222",
    "message": "Wednesday evening",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0223",
    "message": "Ill do masala omellette and 2 bread for breakfast today, in lunch i will have cabbage sabji and curd and parathe 2, and dinner will be khichdi",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0224",
    "message": "I did it. Check hevy and log. Review how the workout wrnt",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0225",
    "message": "Add how to get to heaven from belfast as a series to watch. Will be starting today onwards",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0226",
    "message": "For breakfast today i just had a tea\nFor lunch i had 2 plain parathas, boondi raita, and cabbage sabzi\nThen another tea",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0227",
    "message": "It is not 1930 calories.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0228",
    "message": "Add task for cooker fixing and mixer repair for saturday",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0229",
    "message": "Remind me too",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0230",
    "message": "Whats on my watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0231",
    "message": "Michael i have watched already",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0232",
    "message": "I ate a samosa just now, and a tea",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0233",
    "message": "Meal breakdown",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0234",
    "message": "Meal breakdown for entire day",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0235",
    "message": "Whats all on my readlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0236",
    "message": "Die with zero - i am no longer reading it. In todays treadmill session i watched the video summary for the book, which was enough. Ill move to the next book. \n\nCan you give me genre and short description of each book, and ratings",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0237",
    "message": "Mark die with zero as done. \nAdd catch 22 in readlist, ill begin with that",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0238",
    "message": "Now what's in my readlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0239",
    "message": "Mark die with zero as done. Add a comment that i watched the video and hence skipping it.",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0240",
    "message": "For dinner i just ate rice and daal",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0241",
    "message": "Samosa and tea was in evening and not mid morning. And lunch had a tea too",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0242",
    "message": "Why did you change breakfast and dinner?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0243",
    "message": "I ate a cornettos icecream cone today after dinner",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0244",
    "message": "That's right, thanks!",
    "source": "real_chat",
    "category": "follow_up",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0245",
    "message": "All set",
    "source": "real_chat",
    "category": "follow_up",
    "observedIntent": null,
    "requiresPriorTurn": true,
    "issueTags": [
      "needs_prior_turn"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0246",
    "message": "I did the ai session today too. Fixing meal items. \n\nAnd I'll read catch 22 before sleep. Good night",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0247",
    "message": "Add while my guitar gently weeps in guitar learning playlist. And find a learning video and add to my youtube playlist for guitar learning",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0248",
    "message": "I dont think thr youtube video was sabed",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0249",
    "message": "What should i watch for treadmill tomorrow",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0250",
    "message": "No something from my wisdom youtube playlist",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0251",
    "message": "Whats the gym plan for today. And meal plan for today",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0252",
    "message": "Add 5 famous rock songs from the 70s in my hugh energy workout playlist in youtube music",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "playlist_name_confusion"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0253",
    "message": "There is a high energy workout mix playlist in youtube music. Check",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "playlist_name_confusion"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0254",
    "message": "Yes add them in this playlist",
    "source": "real_chat",
    "category": "general_youtube",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    }
  },
  {
    "id": "cmt-0255",
    "message": "Add Rocky movie series to my watchlist. Research what all are there in the series and add all of them",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0256",
    "message": "What all is in my watchlist now",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0257",
    "message": "Yes clean up Michael and keep only one entry",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0258",
    "message": "I did today's workout. Check hevy and review and log",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0259",
    "message": "For breakfast today, I am having 2 besan cheelas, ketchup, and a tea",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "meal_log_tense"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0260",
    "message": "For breakfast today, I ate 2 besan cheelas, ketchup, and a tea",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0261",
    "message": "I ate 2 besan cheelas, ketchup, and a tea in breakfast",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0262",
    "message": "Remind me to buy ghewar on Friday morning",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0263",
    "message": "I had this for lunch",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0264",
    "message": "I had a crispy chicken California burrito bowl for lunch and a diet coke",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0265",
    "message": "You logged burrito bowl twice, i only ate one",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "duplicate_action"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0266",
    "message": "Did i log my breakfast today?",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0267",
    "message": "I am eating a dahi aloo tikki from bistro and a cold coffee shake",
    "source": "real_chat",
    "category": "general_conversation",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "meal_log_tense"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0268",
    "message": "Meal breakdown for thr day",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0269",
    "message": "Whats the meal plan for tomorrow",
    "source": "real_chat",
    "category": "health_meal_plan",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "ambiguous_routing"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0270",
    "message": "Add dil chahta h to my watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0271",
    "message": "Ensuring good gym and not missing skipping, while staying happy at end of day",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0272",
    "message": "Undo this.",
    "source": "real_chat",
    "category": "follow_up",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "undo_disambiguation"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0273",
    "message": "Add ship of theseus in my watch list",
    "source": "real_chat",
    "category": "wisdom",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0274",
    "message": "What all is in my watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0275",
    "message": "When did i add ship of theseus to watchlist",
    "source": "real_chat",
    "category": "happiness_media",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [
      "timestamp_unavailable"
    ],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0276",
    "message": "I didn't go to gym today. I missed it because i feel tired. Today was supposed to be cardio and abs",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0277",
    "message": "Still there a bit tired. But will not leave for work. I have swimming in evening for light workout",
    "source": "real_chat",
    "category": "health_fitness",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0278",
    "message": "For breakfast i had fried idli and tea tofay",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0279",
    "message": "I had 2 paratha, bhindi sabji, and boondi raita for lunch",
    "source": "real_chat",
    "category": "health_meal",
    "observedIntent": null,
    "requiresPriorTurn": false,
    "issueTags": [],
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    }
  },
  {
    "id": "cmt-0280",
    "message": "meal: chicken rice and dal",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0281",
    "message": "/meal oats and banana",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0282",
    "message": "log meal: paneer tikka",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0283",
    "message": "ate: scrambled eggs and toast",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0284",
    "message": "just had: protein shake",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0285",
    "message": "log breakfast: oats and berries",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0286",
    "message": "log lunch: chicken salad",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0287",
    "message": "log dinner: salmon and veggies",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0288",
    "message": "log snack: almonds and apple",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0289",
    "message": "/meal@MagnusBot rice bowl",
    "source": "catalog",
    "category": "health_meal_log",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0290",
    "message": "what did I eat today?",
    "source": "catalog",
    "category": "health_meal_history",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0291",
    "message": "what did I eat yesterday?",
    "source": "catalog",
    "category": "health_meal_history",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0292",
    "message": "show my meals this week",
    "source": "catalog",
    "category": "health_meal_history",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0293",
    "message": "undo my last meal",
    "source": "catalog",
    "category": "health_meal_history",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_history_undo",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "undo_disambiguation"
    ]
  },
  {
    "id": "cmt-0294",
    "message": "delete the last meal log",
    "source": "catalog",
    "category": "health_meal_history",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_history_undo",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0295",
    "message": "show my macro targets",
    "source": "catalog",
    "category": "health_meal_targets",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_targets_show",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0296",
    "message": "set protein to 140g daily",
    "source": "catalog",
    "category": "health_meal_targets",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_targets_set",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0297",
    "message": "set calories to 2200",
    "source": "catalog",
    "category": "health_meal_targets",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_targets_set",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0298",
    "message": "plan my meals for the week",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_create",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0299",
    "message": "help me build a meal plan for next week",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_create",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0300",
    "message": "what am I eating tomorrow?",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_read",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0301",
    "message": "show my meal plan for Monday",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_read",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0302",
    "message": "skip lunch tomorrow",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_skip",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0303",
    "message": "swap dinner for salad tomorrow",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_swap",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0304",
    "message": "switch lunch and dinner for today",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_swap",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0305",
    "message": "copy last week meal plan",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_copy_week",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0306",
    "message": "save as template high protein",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_template_save",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0307",
    "message": "list meal plan templates",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_templates_list",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0308",
    "message": "apply template high protein",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_template_apply",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0309",
    "message": "shopping list for this week",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_shopping_list",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0310",
    "message": "grocery list from my meal plan",
    "source": "catalog",
    "category": "health_meal_plan",
    "idealIntent": "HEALTH",
    "idealCapability": "meal_plan_shopping_list",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0311",
    "message": "should I train legs today?",
    "source": "catalog",
    "category": "health_fitness",
    "idealIntent": "HEALTH",
    "idealCapability": "fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0312",
    "message": "what's my gym session today?",
    "source": "catalog",
    "category": "health_fitness",
    "idealIntent": "HEALTH",
    "idealCapability": "fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0313",
    "message": "Pull data from hevy and review my last workout",
    "source": "catalog",
    "category": "health_fitness",
    "idealIntent": "HEALTH",
    "idealCapability": "fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0314",
    "message": "recap my push workout from yesterday",
    "source": "catalog",
    "category": "health_fitness",
    "idealIntent": "HEALTH",
    "idealCapability": "fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0315",
    "message": "how was my gym session today?",
    "source": "catalog",
    "category": "health_fitness",
    "idealIntent": "HEALTH",
    "idealCapability": "fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0316",
    "message": "hevy routine: push day A",
    "source": "catalog",
    "category": "health_hevy_write",
    "idealIntent": "HEALTH",
    "idealCapability": "hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0317",
    "message": "hevy workout: legs and calves",
    "source": "catalog",
    "category": "health_hevy_write",
    "idealIntent": "HEALTH",
    "idealCapability": "hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0318",
    "message": "how much protein should I aim for?",
    "source": "catalog",
    "category": "health_nutrition",
    "idealIntent": "HEALTH",
    "idealCapability": "nutrition_advice",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0319",
    "message": "is intermittent fasting okay for me?",
    "source": "catalog",
    "category": "health_nutrition",
    "idealIntent": "HEALTH",
    "idealCapability": "nutrition_advice",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0320",
    "message": "vegan swap for paneer in this recipe",
    "source": "catalog",
    "category": "health_alternates",
    "idealIntent": "HEALTH",
    "idealCapability": "alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0321",
    "message": "instead of butter what can I use?",
    "source": "catalog",
    "category": "health_alternates",
    "idealIntent": "HEALTH",
    "idealCapability": "alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0322",
    "message": "I'm exhausted and slept badly",
    "source": "catalog",
    "category": "health_energy",
    "idealIntent": "HEALTH",
    "idealCapability": "energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0323",
    "message": "my HRV has been low all week",
    "source": "catalog",
    "category": "health_energy",
    "idealIntent": "HEALTH",
    "idealCapability": "energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0324",
    "message": "wrap up my health day",
    "source": "catalog",
    "category": "health_journal",
    "idealIntent": "HEALTH",
    "idealCapability": "journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0325",
    "message": "end of day health journal",
    "source": "catalog",
    "category": "health_journal",
    "idealIntent": "HEALTH",
    "idealCapability": "journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0326",
    "message": "16 week half marathon plan",
    "source": "catalog",
    "category": "health_long_term",
    "idealIntent": "HEALTH",
    "idealCapability": "long_term_planning",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0327",
    "message": "build a season plan for strength",
    "source": "catalog",
    "category": "health_long_term",
    "idealIntent": "HEALTH",
    "idealCapability": "long_term_planning",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0328",
    "message": "show my kite portfolio",
    "source": "catalog",
    "category": "wealth",
    "idealIntent": "WEALTH",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0329",
    "message": "show my net worth on kite",
    "source": "catalog",
    "category": "wealth",
    "idealIntent": "WEALTH",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0330",
    "message": "show my zerodha holdings",
    "source": "catalog",
    "category": "wealth",
    "idealIntent": "WEALTH",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0331",
    "message": "link kite account",
    "source": "catalog",
    "category": "wealth",
    "idealIntent": "WEALTH",
    "idealCapability": "kite_connect",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0332",
    "message": "am I saving enough for retirement?",
    "source": "catalog",
    "category": "wealth",
    "idealIntent": "WEALTH",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0333",
    "message": "how should I allocate my emergency fund?",
    "source": "catalog",
    "category": "wealth",
    "idealIntent": "WEALTH",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0334",
    "message": "what is my cash flow this month?",
    "source": "catalog",
    "category": "wealth",
    "idealIntent": "WEALTH",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0335",
    "message": "FIRE number for my lifestyle",
    "source": "catalog",
    "category": "wealth",
    "idealIntent": "WEALTH",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0336",
    "message": "debt payoff vs investing tradeoff",
    "source": "catalog",
    "category": "wealth",
    "idealIntent": "WEALTH",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0337",
    "message": "recommend a film like Arrival",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "recommendations",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0338",
    "message": "books like Project Hail Mary",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "recommendations",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0339",
    "message": "what game should I play this weekend?",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "recommendations",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0340",
    "message": "music album for a rainy evening",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "recommendations",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0341",
    "message": "poetry to read tonight",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "recommendations",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0342",
    "message": "ideas for a restorative weekend",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "travel_rest",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0343",
    "message": "weekend trip ideas near mountains",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "travel_rest",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0344",
    "message": "how do I reconnect with an old friend?",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "relationships",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0345",
    "message": "plan a low-stress vacation pace",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "travel_rest",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0346",
    "message": "creative writing habit without burnout",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "creative_practice",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0347",
    "message": "pick up guitar again for fun",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "creative_practice",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0348",
    "message": "board game for 4 players",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "recommendations",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0349",
    "message": "hobby ideas when I'm too tired to train",
    "source": "catalog",
    "category": "happiness",
    "idealIntent": "HAPPINESS",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0350",
    "message": "help me build a learning plan for Spanish",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "learning_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0351",
    "message": "study plan for AWS cert",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "learning_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0352",
    "message": "curriculum for learning Rust in 90 days",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "learning_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0353",
    "message": "how do I ship my side project faster?",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "project_shipping",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0354",
    "message": "unblock my app launch",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "project_shipping",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0355",
    "message": "smallest next step on my portfolio site",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "project_shipping",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0356",
    "message": "prep for a promotion conversation",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "career_direction",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0357",
    "message": "how do I position for a senior role?",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "career_direction",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0358",
    "message": "deliberate practice routine for chess",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "skill_practice",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0359",
    "message": "daily practice drills for piano",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "skill_practice",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0360",
    "message": "career growth when feeling stuck",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "coaching",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0361",
    "message": "milestones for my open source project",
    "source": "catalog",
    "category": "wisdom",
    "idealIntent": "WISDOM",
    "idealCapability": "project_shipping",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0362",
    "message": "what's on my calendar tomorrow?",
    "source": "catalog",
    "category": "general_calendar",
    "idealIntent": "GENERAL",
    "idealCapability": "calendar",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0363",
    "message": "what's on my calendar this week?",
    "source": "catalog",
    "category": "general_calendar",
    "idealIntent": "GENERAL",
    "idealCapability": "calendar",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0364",
    "message": "schedule dentist Tuesday 3pm",
    "source": "catalog",
    "category": "general_calendar",
    "idealIntent": "GENERAL",
    "idealCapability": "calendar",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0365",
    "message": "cancel my dentist appointment",
    "source": "catalog",
    "category": "general_calendar",
    "idealIntent": "GENERAL",
    "idealCapability": "calendar",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0366",
    "message": "move team meeting to 4pm",
    "source": "catalog",
    "category": "general_calendar",
    "idealIntent": "GENERAL",
    "idealCapability": "calendar",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0367",
    "message": "connect calendar",
    "source": "catalog",
    "category": "general_calendar",
    "idealIntent": "GENERAL",
    "idealCapability": "calendar",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0368",
    "message": "what does my entire day look like tomorrow?",
    "source": "catalog",
    "category": "general_day_overview",
    "idealIntent": "GENERAL",
    "idealCapability": "day_overview",
    "notes": "Holistic day — not HEALTH meal_plan_read",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0369",
    "message": "what's on for the whole day Saturday?",
    "source": "catalog",
    "category": "general_day_overview",
    "idealIntent": "GENERAL",
    "idealCapability": "day_overview",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0370",
    "message": "show me tomorrow: calendar, commitments, and meals",
    "source": "catalog",
    "category": "general_day_overview",
    "idealIntent": "GENERAL",
    "idealCapability": "day_overview",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0371",
    "message": "what does my week look like?",
    "source": "catalog",
    "category": "general_day_overview",
    "idealIntent": "GENERAL",
    "idealCapability": "day_overview",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0372",
    "message": "search YouTube for lo-fi study beats",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0373",
    "message": "search YouTube for jazz piano",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0374",
    "message": "add to wisdom playlist",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0375",
    "message": "bookmark this song on youtube",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0376",
    "message": "play next in cue queue",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0377",
    "message": "clear my magnus playlist",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0378",
    "message": "dedupe wisdom playlist",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0379",
    "message": "recommend songs on yt music for focus",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0380",
    "message": "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0381",
    "message": "show my happiness playlist",
    "source": "catalog",
    "category": "general_youtube",
    "idealIntent": "GENERAL",
    "idealCapability": "youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0382",
    "message": "add Dune to my readlist",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0383",
    "message": "what's on my watchlist?",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0384",
    "message": "recommend a short thriller from my watchlist",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0385",
    "message": "show my tasks list",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0386",
    "message": "mark done on tasks list",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0387",
    "message": "list_catalog",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0388",
    "message": "what is on my food list",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0389",
    "message": "recommend dinner from my food list",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0390",
    "message": "add Inception to watchlist",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0391",
    "message": "update readlist item Dune to done",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0392",
    "message": "create_list weekend errands",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0393",
    "message": "open my travel list",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0394",
    "message": "show my music list",
    "source": "catalog",
    "category": "general_lists",
    "idealIntent": "GENERAL",
    "idealCapability": "lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0395",
    "message": "log joy tank 72",
    "source": "catalog",
    "category": "general_lifeos",
    "idealIntent": "GENERAL",
    "idealCapability": "lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0396",
    "message": "log joy tank",
    "source": "catalog",
    "category": "general_lifeos",
    "idealIntent": "GENERAL",
    "idealCapability": "lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0397",
    "message": "health pillar is at_risk today",
    "source": "catalog",
    "category": "general_lifeos",
    "idealIntent": "GENERAL",
    "idealCapability": "lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0398",
    "message": "wealth pillar deviating",
    "source": "catalog",
    "category": "general_lifeos",
    "idealIntent": "GENERAL",
    "idealCapability": "lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0399",
    "message": "log this in my daily checkins",
    "source": "catalog",
    "category": "general_lifeos",
    "idealIntent": "GENERAL",
    "idealCapability": "lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0400",
    "message": "save today's check-in",
    "source": "catalog",
    "category": "general_lifeos",
    "idealIntent": "GENERAL",
    "idealCapability": "lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0401",
    "message": "add goal save for house",
    "source": "catalog",
    "category": "general_lifeos",
    "idealIntent": "GENERAL",
    "idealCapability": "lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0402",
    "message": "list_lifeos_goals",
    "source": "catalog",
    "category": "general_lifeos",
    "idealIntent": "GENERAL",
    "idealCapability": "lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0403",
    "message": "get_daily_checkin for today",
    "source": "catalog",
    "category": "general_lifeos",
    "idealIntent": "GENERAL",
    "idealCapability": "lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0404",
    "message": "sync notion lists",
    "source": "catalog",
    "category": "general_notion",
    "idealIntent": "GENERAL",
    "idealCapability": "notion",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0405",
    "message": "setup notion",
    "source": "catalog",
    "category": "general_notion",
    "idealIntent": "GENERAL",
    "idealCapability": "notion",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0406",
    "message": "link notion for my lists",
    "source": "catalog",
    "category": "general_notion",
    "idealIntent": "GENERAL",
    "idealCapability": "notion",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0407",
    "message": "reschedule my gym commitment to Friday",
    "source": "catalog",
    "category": "general_event_log",
    "idealIntent": "GENERAL",
    "idealCapability": "event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0408",
    "message": "log_event gym 7am tomorrow",
    "source": "catalog",
    "category": "general_event_log",
    "idealIntent": "GENERAL",
    "idealCapability": "event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0409",
    "message": "list_events this week",
    "source": "catalog",
    "category": "general_event_log",
    "idealIntent": "GENERAL",
    "idealCapability": "event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0410",
    "message": "update_event meditation done",
    "source": "catalog",
    "category": "general_event_log",
    "idealIntent": "GENERAL",
    "idealCapability": "event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0411",
    "message": "reschedule_event morning run to Sunday",
    "source": "catalog",
    "category": "general_event_log",
    "idealIntent": "GENERAL",
    "idealCapability": "event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0412",
    "message": "move my commitment to study to 8pm",
    "source": "catalog",
    "category": "general_event_log",
    "idealIntent": "GENERAL",
    "idealCapability": "event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0413",
    "message": "remind me tomorrow at 8pm to call mom",
    "source": "catalog",
    "category": "general_proactive",
    "idealIntent": "GENERAL",
    "idealCapability": "proactive",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0414",
    "message": "remind me every day at 9am to stretch",
    "source": "catalog",
    "category": "general_proactive",
    "idealIntent": "GENERAL",
    "idealCapability": "proactive",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0415",
    "message": "disable evening journal",
    "source": "catalog",
    "category": "general_proactive",
    "idealIntent": "GENERAL",
    "idealCapability": "proactive",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0416",
    "message": "enable drift guard",
    "source": "catalog",
    "category": "general_proactive",
    "idealIntent": "GENERAL",
    "idealCapability": "proactive",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0417",
    "message": "turn off stale list nudge",
    "source": "catalog",
    "category": "general_proactive",
    "idealIntent": "GENERAL",
    "idealCapability": "proactive",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0418",
    "message": "remind me tonight at 9pm to journal",
    "source": "catalog",
    "category": "general_proactive",
    "idealIntent": "GENERAL",
    "idealCapability": "proactive",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0419",
    "message": "quick note: great meeting with design team",
    "source": "catalog",
    "category": "general_journal",
    "idealIntent": "GENERAL",
    "idealCapability": "journal_note",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0420",
    "message": "log_note: idea for product roadmap",
    "source": "catalog",
    "category": "general_journal",
    "idealIntent": "GENERAL",
    "idealCapability": "journal_note",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0421",
    "message": "connect zerodha from general",
    "source": "catalog",
    "category": "general_zerodha",
    "idealIntent": "GENERAL",
    "idealCapability": "zerodha_connect",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0422",
    "message": "review my hevy workout and log this in my daily checkins",
    "source": "catalog",
    "category": "general_pillar_consultation",
    "idealIntent": "GENERAL",
    "idealCapability": "pillar_consultation",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false,
      "consultPillars": [
        "HEALTH"
      ]
    },
    "issueTags": []
  },
  {
    "id": "cmt-0423",
    "message": "add to watchlist and recommend a film like it",
    "source": "catalog",
    "category": "general_pillar_consultation",
    "idealIntent": "GENERAL",
    "idealCapability": "pillar_consultation",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false,
      "consultPillars": [
        "HAPPINESS"
      ]
    },
    "issueTags": []
  },
  {
    "id": "cmt-0424",
    "message": "what's the capital of Portugal?",
    "source": "catalog",
    "category": "general_conversation",
    "idealIntent": "GENERAL",
    "idealCapability": "conversation",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0425",
    "message": "explain quantum entanglement simply",
    "source": "catalog",
    "category": "general_conversation",
    "idealIntent": "GENERAL",
    "idealCapability": "conversation",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0426",
    "message": "thanks Magnus",
    "source": "catalog",
    "category": "general_conversation",
    "idealIntent": "GENERAL",
    "idealCapability": "conversation",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0427",
    "message": "good morning",
    "source": "catalog",
    "category": "general_conversation",
    "idealIntent": "GENERAL",
    "idealCapability": "conversation",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0428",
    "message": "what can you do?",
    "source": "catalog",
    "category": "general_conversation",
    "idealIntent": "GENERAL",
    "idealCapability": "conversation",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0429",
    "message": "where should we eat on Saturday?",
    "source": "catalog",
    "category": "general_conversation",
    "idealIntent": "HAPPINESS",
    "idealCapability": "recommendations",
    "notes": "Classifier may choose HAPPINESS for social dining taste",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0430",
    "message": "tell me a joke",
    "source": "catalog",
    "category": "general_conversation",
    "idealIntent": "GENERAL",
    "idealCapability": "conversation",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0431",
    "message": "summarize stoic philosophy",
    "source": "catalog",
    "category": "general_conversation",
    "idealIntent": "GENERAL",
    "idealCapability": "conversation",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0432",
    "message": "I am having 2 paratha for lunch",
    "source": "adversarial",
    "category": "health_meal_log",
    "issueTags": [
      "meal_log_tense"
    ],
    "structural": {
      "magnusTools": false,
      "youtubeAction": false,
      "explicitMealLog": false
    }
  },
  {
    "id": "cmt-0433",
    "message": "When did I add Dune to watchlist?",
    "source": "adversarial",
    "category": "general_lists",
    "issueTags": [
      "timestamp_unavailable"
    ],
    "structural": {
      "magnusTools": true,
      "youtubeAction": false,
      "explicitMealLog": false
    }
  },
  {
    "id": "cmt-0434",
    "message": "Add to high energy workout playlist",
    "source": "adversarial",
    "category": "general_youtube",
    "issueTags": [
      "playlist_name_confusion"
    ],
    "structural": {
      "magnusTools": false,
      "youtubeAction": true,
      "explicitMealLog": false
    }
  },
  {
    "id": "cmt-0435",
    "message": "You logged burrito bowl twice",
    "source": "adversarial",
    "category": "health_meal_history",
    "issueTags": [
      "duplicate_action"
    ],
    "structural": {
      "magnusTools": false,
      "youtubeAction": false,
      "explicitMealLog": false
    }
  },
  {
    "id": "cmt-0436",
    "message": "Add rocky series and recommend one for tonight",
    "source": "adversarial",
    "category": "general_pillar_consultation",
    "issueTags": [
      "multi_intent"
    ],
    "structural": {
      "magnusTools": false,
      "youtubeAction": false,
      "explicitMealLog": false
    }
  },
  {
    "id": "cmt-0437",
    "message": "I am eating a dahi aloo tikki",
    "source": "adversarial",
    "category": "health_meal_log",
    "issueTags": [
      "confirmation_loop",
      "meal_log_tense"
    ],
    "structural": {
      "magnusTools": false,
      "youtubeAction": false,
      "explicitMealLog": false
    }
  },
  {
    "id": "cmt-0438",
    "message": "meal: dal rice and sabzi",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0439",
    "message": "I had paneer tikka and 2 rotis for dinner",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0440",
    "message": "log lunch: chole bhature",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0441",
    "message": "just had: protein shake after gym",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0442",
    "message": "ate: idli sambar and filter coffee",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0443",
    "message": "For breakfast I ate poha and tea",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0444",
    "message": "I am having dal makhani and naan",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "meal_log_tense"
    ]
  },
  {
    "id": "cmt-0445",
    "message": "I am eating a salad right now",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "meal_log_tense"
    ]
  },
  {
    "id": "cmt-0446",
    "message": "had biryani for lunch today",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0447",
    "message": "log snack: almonds and banana",
    "source": "synthetic",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0448",
    "message": "did I log breakfast today?",
    "source": "synthetic",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0449",
    "message": "undo last meal",
    "source": "synthetic",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "undo_disambiguation"
    ]
  },
  {
    "id": "cmt-0450",
    "message": "you logged that twice",
    "source": "synthetic",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "duplicate_action"
    ]
  },
  {
    "id": "cmt-0451",
    "message": "correct my lunch calories",
    "source": "synthetic",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0452",
    "message": "show today's macros",
    "source": "synthetic",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0453",
    "message": "review my last Hevy workout",
    "source": "synthetic",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0454",
    "message": "I missed gym because I'm tired",
    "source": "synthetic",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0455",
    "message": "what's the gym plan for today?",
    "source": "synthetic",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0456",
    "message": "log that I skipped cardio",
    "source": "synthetic",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0457",
    "message": "how was my push session?",
    "source": "synthetic",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0458",
    "message": "what's my meal plan for tomorrow?",
    "source": "synthetic",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "ambiguous_routing"
    ]
  },
  {
    "id": "cmt-0459",
    "message": "swap lunch and dinner for tomorrow",
    "source": "synthetic",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0460",
    "message": "lock this meal plan in",
    "source": "synthetic",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0461",
    "message": "cancel meal planning",
    "source": "synthetic",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0462",
    "message": "how much poha should I eat tomorrow?",
    "source": "synthetic",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0463",
    "message": "show my kite holdings",
    "source": "synthetic",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0464",
    "message": "am I saving enough?",
    "source": "synthetic",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0465",
    "message": "when does my ELSS lock-in end?",
    "source": "synthetic",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0466",
    "message": "what's my portfolio allocation?",
    "source": "synthetic",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0467",
    "message": "what should I watch on the treadmill?",
    "source": "synthetic",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0468",
    "message": "restorative weekend ideas",
    "source": "synthetic",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0469",
    "message": "learning plan for Spanish",
    "source": "synthetic",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0470",
    "message": "help me ship my side project",
    "source": "synthetic",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0471",
    "message": "prep for promotion conversation",
    "source": "synthetic",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0472",
    "message": "what's on the AI session agenda?",
    "source": "synthetic",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0473",
    "message": "daily piano practice routine",
    "source": "synthetic",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0474",
    "message": "move AI session to 9pm tomorrow",
    "source": "synthetic",
    "category": "general_calendar",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0475",
    "message": "remove duplicate calendar events",
    "source": "synthetic",
    "category": "general_calendar",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "duplicate_action"
    ]
  },
  {
    "id": "cmt-0476",
    "message": "add gym 7:30am tomorrow to calendar",
    "source": "synthetic",
    "category": "general_calendar",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0477",
    "message": "what does my whole day look like tomorrow?",
    "source": "synthetic",
    "category": "general_day_overview",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0478",
    "message": "what's the plan for tomorrow?",
    "source": "synthetic",
    "category": "general_day_overview",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0479",
    "message": "what do I need to do today?",
    "source": "synthetic",
    "category": "general_day_overview",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0480",
    "message": "gym plan and meal plan for today",
    "source": "synthetic",
    "category": "general_day_overview",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0481",
    "message": "search YouTube for jazz",
    "source": "synthetic",
    "category": "general_youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": []
  },
  {
    "id": "cmt-0482",
    "message": "cue die with zero for treadmill",
    "source": "synthetic",
    "category": "general_youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0483",
    "message": "find animated explainer on credit cycles",
    "source": "synthetic",
    "category": "general_youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0484",
    "message": "add 5 rock songs to workout playlist",
    "source": "synthetic",
    "category": "general_youtube",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": true
    },
    "issueTags": [
      "playlist_name_confusion"
    ]
  },
  {
    "id": "cmt-0485",
    "message": "add Dune to readlist",
    "source": "synthetic",
    "category": "general_lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0486",
    "message": "what's on my to-do list?",
    "source": "synthetic",
    "category": "general_lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0487",
    "message": "recommend from my watchlist",
    "source": "synthetic",
    "category": "general_lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0488",
    "message": "mark die with zero as done",
    "source": "synthetic",
    "category": "general_lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0489",
    "message": "clean up duplicate watchlist entries",
    "source": "synthetic",
    "category": "general_lists",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": [
      "duplicate_action"
    ]
  },
  {
    "id": "cmt-0490",
    "message": "remind me tomorrow 8pm to call mom",
    "source": "synthetic",
    "category": "general_proactive",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0491",
    "message": "remind me Friday morning to buy ghewar",
    "source": "synthetic",
    "category": "general_proactive",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0492",
    "message": "enable evening journal",
    "source": "synthetic",
    "category": "general_proactive",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0493",
    "message": "No",
    "source": "synthetic",
    "category": "follow_up",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "needs_prior_turn"
    ]
  },
  {
    "id": "cmt-0494",
    "message": "Yes add them",
    "source": "synthetic",
    "category": "follow_up",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0495",
    "message": "That's right",
    "source": "synthetic",
    "category": "follow_up",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "needs_prior_turn"
    ]
  },
  {
    "id": "cmt-0496",
    "message": "Undo this",
    "source": "synthetic",
    "category": "follow_up",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "undo_disambiguation"
    ]
  },
  {
    "id": "cmt-0497",
    "message": "Go with 1",
    "source": "synthetic",
    "category": "follow_up",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0498",
    "message": "Lock it in",
    "source": "synthetic",
    "category": "follow_up",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0499",
    "message": "What's for today",
    "source": "synthetic",
    "category": "adversarial_ambiguity",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0500",
    "message": "Plan for tomorrow",
    "source": "synthetic",
    "category": "adversarial_ambiguity",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0501",
    "message": "Log it",
    "source": "synthetic",
    "category": "adversarial_ambiguity",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0502",
    "message": "Add that",
    "source": "synthetic",
    "category": "adversarial_ambiguity",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0503",
    "message": "Check it",
    "source": "synthetic",
    "category": "adversarial_ambiguity",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0504",
    "message": "Do the thing",
    "source": "synthetic",
    "category": "adversarial_ambiguity",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0505",
    "message": "Fix it",
    "source": "synthetic",
    "category": "adversarial_ambiguity",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0506",
    "message": "Same as yesterday",
    "source": "synthetic",
    "category": "adversarial_ambiguity",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0507",
    "message": "connect kite",
    "source": "synthetic",
    "category": "general_connect",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0508",
    "message": "sync notion",
    "source": "synthetic",
    "category": "general_connect",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0509",
    "message": "wrap up my day",
    "source": "synthetic",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0510",
    "message": "journal entry for today",
    "source": "synthetic",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0511",
    "message": "log how I'm feeling",
    "source": "synthetic",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0512",
    "message": "log gym 6am tomorrow",
    "source": "synthetic",
    "category": "general_event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0513",
    "message": "reschedule gym to Friday",
    "source": "synthetic",
    "category": "general_event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0514",
    "message": "list my commitments this week",
    "source": "synthetic",
    "category": "general_event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0515",
    "message": "mark cupboard cleanup as done",
    "source": "synthetic",
    "category": "general_event_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0516",
    "message": "log joy tank 70",
    "source": "synthetic",
    "category": "general_lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0517",
    "message": "health pillar at_risk",
    "source": "synthetic",
    "category": "general_lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0518",
    "message": "log daily check-in",
    "source": "synthetic",
    "category": "general_lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0519",
    "message": "what are my goals?",
    "source": "synthetic",
    "category": "general_lifeos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0520",
    "message": "whats on my watchlst",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0521",
    "message": "meal brekdown",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0522",
    "message": "conect zerodha",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0523",
    "message": "mornign brief",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0524",
    "message": "add dil chahta h to watchlist",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0525",
    "message": "log meal: chole bhature",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0526",
    "message": "pull A tommorow",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0527",
    "message": "swiming session was great",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0528",
    "message": "hevy workot review",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0529",
    "message": "readlst items",
    "source": "synthetic",
    "category": "edge_typos",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0530",
    "message": "/meal oats and banana thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0531",
    "message": "/meal oats and banana pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0532",
    "message": "/meal oats and banana?",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0533",
    "message": "hey /meal oats and banana",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0534",
    "message": "hey /meal oats and banana thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0535",
    "message": "hey /meal oats and banana pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0536",
    "message": "log meal: paneer tikka thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0537",
    "message": "log meal: paneer tikka pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0538",
    "message": "log meal: paneer tikka?",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0539",
    "message": "hey log meal: paneer tikka",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0540",
    "message": "hey log meal: paneer tikka thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0541",
    "message": "hey log meal: paneer tikka pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0542",
    "message": "ate: scrambled eggs and toast thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0543",
    "message": "ate: scrambled eggs and toast pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0544",
    "message": "ate: scrambled eggs and toast?",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0545",
    "message": "hey ate: scrambled eggs and toast",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0546",
    "message": "hey ate: scrambled eggs and toast thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0547",
    "message": "hey ate: scrambled eggs and toast pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0548",
    "message": "just had: protein shake thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0549",
    "message": "just had: protein shake pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0550",
    "message": "just had: protein shake?",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0551",
    "message": "hey just had: protein shake",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0552",
    "message": "hey just had: protein shake thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0553",
    "message": "hey just had: protein shake pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0554",
    "message": "log breakfast: oats and berries thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0555",
    "message": "log breakfast: oats and berries pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0556",
    "message": "log breakfast: oats and berries?",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0557",
    "message": "hey log breakfast: oats and berries",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0558",
    "message": "hey log breakfast: oats and berries thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0559",
    "message": "hey log breakfast: oats and berries pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0560",
    "message": "log lunch: chicken salad thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0561",
    "message": "log lunch: chicken salad pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0562",
    "message": "log lunch: chicken salad?",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0563",
    "message": "hey log lunch: chicken salad",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0564",
    "message": "hey log lunch: chicken salad thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0565",
    "message": "hey log lunch: chicken salad pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0566",
    "message": "log dinner: salmon and veggies thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0567",
    "message": "log dinner: salmon and veggies pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0568",
    "message": "log dinner: salmon and veggies?",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0569",
    "message": "hey log dinner: salmon and veggies",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0570",
    "message": "hey log dinner: salmon and veggies thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0571",
    "message": "hey log dinner: salmon and veggies pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0572",
    "message": "log snack: almonds and apple thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0573",
    "message": "log snack: almonds and apple pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0574",
    "message": "log snack: almonds and apple?",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0575",
    "message": "hey log snack: almonds and apple",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0576",
    "message": "hey log snack: almonds and apple thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0577",
    "message": "hey log snack: almonds and apple pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0578",
    "message": "/meal@MagnusBot rice bowl thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0579",
    "message": "/meal@MagnusBot rice bowl pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0580",
    "message": "/meal@MagnusBot rice bowl?",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": true,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0581",
    "message": "hey /meal@MagnusBot rice bowl",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0582",
    "message": "hey /meal@MagnusBot rice bowl thanks",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0583",
    "message": "hey /meal@MagnusBot rice bowl pls",
    "source": "variation",
    "category": "health_meal_log",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0584",
    "message": "what did I eat today? thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0585",
    "message": "what did I eat today? pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0586",
    "message": "what did I eat today??",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0587",
    "message": "hey what did I eat today?",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0588",
    "message": "hey what did I eat today? thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0589",
    "message": "hey what did I eat today? pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0590",
    "message": "what did I eat yesterday? thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0591",
    "message": "what did I eat yesterday? pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0592",
    "message": "what did I eat yesterday??",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0593",
    "message": "hey what did I eat yesterday?",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0594",
    "message": "hey what did I eat yesterday? thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0595",
    "message": "hey what did I eat yesterday? pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0596",
    "message": "show my meals this week thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0597",
    "message": "show my meals this week pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0598",
    "message": "show my meals this week?",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0599",
    "message": "hey show my meals this week",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0600",
    "message": "hey show my meals this week thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0601",
    "message": "hey show my meals this week pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0602",
    "message": "meal breakdown thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0603",
    "message": "meal breakdown pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0604",
    "message": "meal breakdown?",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0605",
    "message": "hey meal breakdown",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0606",
    "message": "hey meal breakdown thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0607",
    "message": "hey meal breakdown pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0608",
    "message": "undo my last meal thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "undo_disambiguation"
    ]
  },
  {
    "id": "cmt-0609",
    "message": "undo my last meal pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "undo_disambiguation"
    ]
  },
  {
    "id": "cmt-0610",
    "message": "undo my last meal?",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "undo_disambiguation"
    ]
  },
  {
    "id": "cmt-0611",
    "message": "hey undo my last meal",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "undo_disambiguation"
    ]
  },
  {
    "id": "cmt-0612",
    "message": "hey undo my last meal thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "undo_disambiguation"
    ]
  },
  {
    "id": "cmt-0613",
    "message": "hey undo my last meal pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": [
      "undo_disambiguation"
    ]
  },
  {
    "id": "cmt-0614",
    "message": "delete the last meal log thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0615",
    "message": "delete the last meal log pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0616",
    "message": "delete the last meal log?",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0617",
    "message": "hey delete the last meal log",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0618",
    "message": "hey delete the last meal log thanks",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0619",
    "message": "hey delete the last meal log pls",
    "source": "variation",
    "category": "health_meal_history",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0620",
    "message": "show my macro targets thanks",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0621",
    "message": "show my macro targets pls",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0622",
    "message": "show my macro targets?",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0623",
    "message": "hey show my macro targets",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0624",
    "message": "hey show my macro targets thanks",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0625",
    "message": "hey show my macro targets pls",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0626",
    "message": "set protein to 140g daily thanks",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0627",
    "message": "set protein to 140g daily pls",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0628",
    "message": "set protein to 140g daily?",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0629",
    "message": "hey set protein to 140g daily",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0630",
    "message": "hey set protein to 140g daily thanks",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0631",
    "message": "hey set protein to 140g daily pls",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0632",
    "message": "set calories to 2200 thanks",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0633",
    "message": "set calories to 2200 pls",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0634",
    "message": "set calories to 2200?",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0635",
    "message": "hey set calories to 2200",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0636",
    "message": "hey set calories to 2200 thanks",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0637",
    "message": "hey set calories to 2200 pls",
    "source": "variation",
    "category": "health_meal_targets",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0638",
    "message": "plan my meals for the week thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0639",
    "message": "plan my meals for the week pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0640",
    "message": "plan my meals for the week?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0641",
    "message": "hey plan my meals for the week",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0642",
    "message": "hey plan my meals for the week thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0643",
    "message": "hey plan my meals for the week pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0644",
    "message": "help me build a meal plan for next week thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0645",
    "message": "help me build a meal plan for next week pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0646",
    "message": "help me build a meal plan for next week?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0647",
    "message": "hey help me build a meal plan for next week",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0648",
    "message": "hey help me build a meal plan for next week thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0649",
    "message": "hey help me build a meal plan for next week pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0650",
    "message": "what am I eating tomorrow? thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0651",
    "message": "what am I eating tomorrow? pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0652",
    "message": "what am I eating tomorrow??",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0653",
    "message": "hey what am I eating tomorrow?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0654",
    "message": "hey what am I eating tomorrow? thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0655",
    "message": "hey what am I eating tomorrow? pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0656",
    "message": "show my meal plan for Monday thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0657",
    "message": "show my meal plan for Monday pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0658",
    "message": "show my meal plan for Monday?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0659",
    "message": "hey show my meal plan for Monday",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0660",
    "message": "hey show my meal plan for Monday thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0661",
    "message": "hey show my meal plan for Monday pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0662",
    "message": "skip lunch tomorrow thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0663",
    "message": "skip lunch tomorrow pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0664",
    "message": "skip lunch tomorrow?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0665",
    "message": "hey skip lunch tomorrow",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0666",
    "message": "hey skip lunch tomorrow thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0667",
    "message": "hey skip lunch tomorrow pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0668",
    "message": "swap dinner for salad tomorrow thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0669",
    "message": "swap dinner for salad tomorrow pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0670",
    "message": "swap dinner for salad tomorrow?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0671",
    "message": "hey swap dinner for salad tomorrow",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0672",
    "message": "hey swap dinner for salad tomorrow thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0673",
    "message": "hey swap dinner for salad tomorrow pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0674",
    "message": "switch lunch and dinner for today thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0675",
    "message": "switch lunch and dinner for today pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0676",
    "message": "switch lunch and dinner for today?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0677",
    "message": "hey switch lunch and dinner for today",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0678",
    "message": "hey switch lunch and dinner for today thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0679",
    "message": "hey switch lunch and dinner for today pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0680",
    "message": "copy last week meal plan thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0681",
    "message": "copy last week meal plan pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0682",
    "message": "copy last week meal plan?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0683",
    "message": "hey copy last week meal plan",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0684",
    "message": "hey copy last week meal plan thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0685",
    "message": "hey copy last week meal plan pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0686",
    "message": "save as template high protein thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0687",
    "message": "save as template high protein pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0688",
    "message": "save as template high protein?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0689",
    "message": "hey save as template high protein",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0690",
    "message": "hey save as template high protein thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0691",
    "message": "hey save as template high protein pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0692",
    "message": "list meal plan templates thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0693",
    "message": "list meal plan templates pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0694",
    "message": "list meal plan templates?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0695",
    "message": "hey list meal plan templates",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0696",
    "message": "hey list meal plan templates thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0697",
    "message": "hey list meal plan templates pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0698",
    "message": "apply template high protein thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0699",
    "message": "apply template high protein pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0700",
    "message": "apply template high protein?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0701",
    "message": "hey apply template high protein",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0702",
    "message": "hey apply template high protein thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0703",
    "message": "hey apply template high protein pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0704",
    "message": "shopping list for this week thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0705",
    "message": "shopping list for this week pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0706",
    "message": "shopping list for this week?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0707",
    "message": "hey shopping list for this week",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0708",
    "message": "hey shopping list for this week thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0709",
    "message": "hey shopping list for this week pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0710",
    "message": "grocery list from my meal plan thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0711",
    "message": "grocery list from my meal plan pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0712",
    "message": "grocery list from my meal plan?",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0713",
    "message": "hey grocery list from my meal plan",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0714",
    "message": "hey grocery list from my meal plan thanks",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0715",
    "message": "hey grocery list from my meal plan pls",
    "source": "variation",
    "category": "health_meal_plan",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0716",
    "message": "should I train legs today? thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0717",
    "message": "should I train legs today? pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0718",
    "message": "should I train legs today??",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0719",
    "message": "hey should I train legs today?",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0720",
    "message": "hey should I train legs today? thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0721",
    "message": "hey should I train legs today? pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0722",
    "message": "what's my gym session today? thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0723",
    "message": "what's my gym session today? pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0724",
    "message": "what's my gym session today??",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0725",
    "message": "hey what's my gym session today?",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0726",
    "message": "hey what's my gym session today? thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0727",
    "message": "hey what's my gym session today? pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0728",
    "message": "Pull data from hevy and review my last workout thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0729",
    "message": "Pull data from hevy and review my last workout pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0730",
    "message": "Pull data from hevy and review my last workout?",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0731",
    "message": "hey Pull data from hevy and review my last workout",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0732",
    "message": "hey Pull data from hevy and review my last workout thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0733",
    "message": "hey Pull data from hevy and review my last workout pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0734",
    "message": "recap my push workout from yesterday thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0735",
    "message": "recap my push workout from yesterday pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0736",
    "message": "recap my push workout from yesterday?",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0737",
    "message": "hey recap my push workout from yesterday",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0738",
    "message": "hey recap my push workout from yesterday thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0739",
    "message": "hey recap my push workout from yesterday pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0740",
    "message": "how was my gym session today? thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0741",
    "message": "how was my gym session today? pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0742",
    "message": "how was my gym session today??",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0743",
    "message": "hey how was my gym session today?",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0744",
    "message": "hey how was my gym session today? thanks",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0745",
    "message": "hey how was my gym session today? pls",
    "source": "variation",
    "category": "health_fitness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0746",
    "message": "hevy routine: push day A thanks",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0747",
    "message": "hevy routine: push day A pls",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0748",
    "message": "hevy routine: push day A?",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0749",
    "message": "hey hevy routine: push day A",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0750",
    "message": "hey hevy routine: push day A thanks",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0751",
    "message": "hey hevy routine: push day A pls",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0752",
    "message": "hevy workout: legs and calves thanks",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0753",
    "message": "hevy workout: legs and calves pls",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0754",
    "message": "hevy workout: legs and calves?",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0755",
    "message": "hey hevy workout: legs and calves",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0756",
    "message": "hey hevy workout: legs and calves thanks",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0757",
    "message": "hey hevy workout: legs and calves pls",
    "source": "variation",
    "category": "health_hevy_write",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0758",
    "message": "how much protein should I aim for? thanks",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0759",
    "message": "how much protein should I aim for? pls",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0760",
    "message": "how much protein should I aim for??",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0761",
    "message": "hey how much protein should I aim for?",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0762",
    "message": "hey how much protein should I aim for? thanks",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0763",
    "message": "hey how much protein should I aim for? pls",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0764",
    "message": "is intermittent fasting okay for me? thanks",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0765",
    "message": "is intermittent fasting okay for me? pls",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0766",
    "message": "is intermittent fasting okay for me??",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0767",
    "message": "hey is intermittent fasting okay for me?",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0768",
    "message": "hey is intermittent fasting okay for me? thanks",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0769",
    "message": "hey is intermittent fasting okay for me? pls",
    "source": "variation",
    "category": "health_nutrition",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0770",
    "message": "vegan swap for paneer in this recipe thanks",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0771",
    "message": "vegan swap for paneer in this recipe pls",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0772",
    "message": "vegan swap for paneer in this recipe?",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0773",
    "message": "hey vegan swap for paneer in this recipe",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0774",
    "message": "hey vegan swap for paneer in this recipe thanks",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0775",
    "message": "hey vegan swap for paneer in this recipe pls",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0776",
    "message": "instead of butter what can I use? thanks",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0777",
    "message": "instead of butter what can I use? pls",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0778",
    "message": "instead of butter what can I use??",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0779",
    "message": "hey instead of butter what can I use?",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0780",
    "message": "hey instead of butter what can I use? thanks",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0781",
    "message": "hey instead of butter what can I use? pls",
    "source": "variation",
    "category": "health_alternates",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0782",
    "message": "I'm exhausted and slept badly thanks",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0783",
    "message": "I'm exhausted and slept badly pls",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0784",
    "message": "I'm exhausted and slept badly?",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0785",
    "message": "hey I'm exhausted and slept badly",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0786",
    "message": "hey I'm exhausted and slept badly thanks",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0787",
    "message": "hey I'm exhausted and slept badly pls",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0788",
    "message": "my HRV has been low all week thanks",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0789",
    "message": "my HRV has been low all week pls",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0790",
    "message": "my HRV has been low all week?",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0791",
    "message": "hey my HRV has been low all week",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0792",
    "message": "hey my HRV has been low all week thanks",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0793",
    "message": "hey my HRV has been low all week pls",
    "source": "variation",
    "category": "health_energy",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0794",
    "message": "wrap up my health day thanks",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0795",
    "message": "wrap up my health day pls",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0796",
    "message": "wrap up my health day?",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0797",
    "message": "hey wrap up my health day",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0798",
    "message": "hey wrap up my health day thanks",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0799",
    "message": "hey wrap up my health day pls",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0800",
    "message": "end of day health journal thanks",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0801",
    "message": "end of day health journal pls",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0802",
    "message": "end of day health journal?",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0803",
    "message": "hey end of day health journal",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0804",
    "message": "hey end of day health journal thanks",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0805",
    "message": "hey end of day health journal pls",
    "source": "variation",
    "category": "health_journal",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0806",
    "message": "16 week half marathon plan thanks",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0807",
    "message": "16 week half marathon plan pls",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0808",
    "message": "16 week half marathon plan?",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0809",
    "message": "hey 16 week half marathon plan",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0810",
    "message": "hey 16 week half marathon plan thanks",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0811",
    "message": "hey 16 week half marathon plan pls",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0812",
    "message": "build a season plan for strength thanks",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0813",
    "message": "build a season plan for strength pls",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0814",
    "message": "build a season plan for strength?",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0815",
    "message": "hey build a season plan for strength",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0816",
    "message": "hey build a season plan for strength thanks",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0817",
    "message": "hey build a season plan for strength pls",
    "source": "variation",
    "category": "health_long_term",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0818",
    "message": "show my kite portfolio thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0819",
    "message": "show my kite portfolio pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0820",
    "message": "show my kite portfolio?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0821",
    "message": "hey show my kite portfolio",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0822",
    "message": "hey show my kite portfolio thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0823",
    "message": "hey show my kite portfolio pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0824",
    "message": "show my net worth on kite thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0825",
    "message": "show my net worth on kite pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0826",
    "message": "show my net worth on kite?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0827",
    "message": "hey show my net worth on kite",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0828",
    "message": "hey show my net worth on kite thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0829",
    "message": "hey show my net worth on kite pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0830",
    "message": "show my zerodha holdings thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0831",
    "message": "show my zerodha holdings pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0832",
    "message": "show my zerodha holdings?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0833",
    "message": "hey show my zerodha holdings",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0834",
    "message": "hey show my zerodha holdings thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0835",
    "message": "hey show my zerodha holdings pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0836",
    "message": "connect zerodha thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0837",
    "message": "connect zerodha pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0838",
    "message": "connect zerodha?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0839",
    "message": "hey connect zerodha",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0840",
    "message": "hey connect zerodha thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0841",
    "message": "hey connect zerodha pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0842",
    "message": "link kite account thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0843",
    "message": "link kite account pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0844",
    "message": "link kite account?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0845",
    "message": "hey link kite account",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0846",
    "message": "hey link kite account thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0847",
    "message": "hey link kite account pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0848",
    "message": "am I saving enough for retirement? thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0849",
    "message": "am I saving enough for retirement? pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0850",
    "message": "am I saving enough for retirement??",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0851",
    "message": "hey am I saving enough for retirement?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0852",
    "message": "hey am I saving enough for retirement? thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0853",
    "message": "hey am I saving enough for retirement? pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0854",
    "message": "how should I allocate my emergency fund? thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0855",
    "message": "how should I allocate my emergency fund? pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0856",
    "message": "how should I allocate my emergency fund??",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0857",
    "message": "hey how should I allocate my emergency fund?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0858",
    "message": "hey how should I allocate my emergency fund? thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0859",
    "message": "hey how should I allocate my emergency fund? pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0860",
    "message": "what is my cash flow this month? thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0861",
    "message": "what is my cash flow this month? pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0862",
    "message": "what is my cash flow this month??",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0863",
    "message": "hey what is my cash flow this month?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0864",
    "message": "hey what is my cash flow this month? thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0865",
    "message": "hey what is my cash flow this month? pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0866",
    "message": "FIRE number for my lifestyle thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0867",
    "message": "FIRE number for my lifestyle pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0868",
    "message": "FIRE number for my lifestyle?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0869",
    "message": "hey FIRE number for my lifestyle",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0870",
    "message": "hey FIRE number for my lifestyle thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0871",
    "message": "hey FIRE number for my lifestyle pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0872",
    "message": "debt payoff vs investing tradeoff thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0873",
    "message": "debt payoff vs investing tradeoff pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0874",
    "message": "debt payoff vs investing tradeoff?",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0875",
    "message": "hey debt payoff vs investing tradeoff",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0876",
    "message": "hey debt payoff vs investing tradeoff thanks",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0877",
    "message": "hey debt payoff vs investing tradeoff pls",
    "source": "variation",
    "category": "wealth",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0878",
    "message": "recommend a film like Arrival thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0879",
    "message": "recommend a film like Arrival pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0880",
    "message": "recommend a film like Arrival?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0881",
    "message": "hey recommend a film like Arrival",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0882",
    "message": "hey recommend a film like Arrival thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0883",
    "message": "hey recommend a film like Arrival pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0884",
    "message": "books like Project Hail Mary thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0885",
    "message": "books like Project Hail Mary pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0886",
    "message": "books like Project Hail Mary?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0887",
    "message": "hey books like Project Hail Mary",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0888",
    "message": "hey books like Project Hail Mary thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0889",
    "message": "hey books like Project Hail Mary pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0890",
    "message": "what game should I play this weekend? thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0891",
    "message": "what game should I play this weekend? pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0892",
    "message": "what game should I play this weekend??",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0893",
    "message": "hey what game should I play this weekend?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0894",
    "message": "hey what game should I play this weekend? thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0895",
    "message": "hey what game should I play this weekend? pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0896",
    "message": "music album for a rainy evening thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0897",
    "message": "music album for a rainy evening pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0898",
    "message": "music album for a rainy evening?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0899",
    "message": "hey music album for a rainy evening",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0900",
    "message": "hey music album for a rainy evening thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0901",
    "message": "hey music album for a rainy evening pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0902",
    "message": "poetry to read tonight thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0903",
    "message": "poetry to read tonight pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0904",
    "message": "poetry to read tonight?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0905",
    "message": "hey poetry to read tonight",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0906",
    "message": "hey poetry to read tonight thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0907",
    "message": "hey poetry to read tonight pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0908",
    "message": "ideas for a restorative weekend thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0909",
    "message": "ideas for a restorative weekend pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0910",
    "message": "ideas for a restorative weekend?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0911",
    "message": "hey ideas for a restorative weekend",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0912",
    "message": "hey ideas for a restorative weekend thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0913",
    "message": "hey ideas for a restorative weekend pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0914",
    "message": "weekend trip ideas near mountains thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0915",
    "message": "weekend trip ideas near mountains pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0916",
    "message": "weekend trip ideas near mountains?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0917",
    "message": "hey weekend trip ideas near mountains",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0918",
    "message": "hey weekend trip ideas near mountains thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0919",
    "message": "hey weekend trip ideas near mountains pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0920",
    "message": "how do I reconnect with an old friend? thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0921",
    "message": "how do I reconnect with an old friend? pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0922",
    "message": "how do I reconnect with an old friend??",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0923",
    "message": "hey how do I reconnect with an old friend?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0924",
    "message": "hey how do I reconnect with an old friend? thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0925",
    "message": "hey how do I reconnect with an old friend? pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0926",
    "message": "plan a low-stress vacation pace thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0927",
    "message": "plan a low-stress vacation pace pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0928",
    "message": "plan a low-stress vacation pace?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0929",
    "message": "hey plan a low-stress vacation pace",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0930",
    "message": "hey plan a low-stress vacation pace thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0931",
    "message": "hey plan a low-stress vacation pace pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": true,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0932",
    "message": "creative writing habit without burnout thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0933",
    "message": "creative writing habit without burnout pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0934",
    "message": "creative writing habit without burnout?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0935",
    "message": "hey creative writing habit without burnout",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0936",
    "message": "hey creative writing habit without burnout thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0937",
    "message": "hey creative writing habit without burnout pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0938",
    "message": "pick up guitar again for fun thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0939",
    "message": "pick up guitar again for fun pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0940",
    "message": "pick up guitar again for fun?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0941",
    "message": "hey pick up guitar again for fun",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0942",
    "message": "hey pick up guitar again for fun thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0943",
    "message": "hey pick up guitar again for fun pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0944",
    "message": "board game for 4 players thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0945",
    "message": "board game for 4 players pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0946",
    "message": "board game for 4 players?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0947",
    "message": "hey board game for 4 players",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0948",
    "message": "hey board game for 4 players thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0949",
    "message": "hey board game for 4 players pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0950",
    "message": "hobby ideas when I'm too tired to train thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0951",
    "message": "hobby ideas when I'm too tired to train pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0952",
    "message": "hobby ideas when I'm too tired to train?",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0953",
    "message": "hey hobby ideas when I'm too tired to train",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0954",
    "message": "hey hobby ideas when I'm too tired to train thanks",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0955",
    "message": "hey hobby ideas when I'm too tired to train pls",
    "source": "variation",
    "category": "happiness",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0956",
    "message": "help me build a learning plan for Spanish thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0957",
    "message": "help me build a learning plan for Spanish pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0958",
    "message": "help me build a learning plan for Spanish?",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0959",
    "message": "hey help me build a learning plan for Spanish",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0960",
    "message": "hey help me build a learning plan for Spanish thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0961",
    "message": "hey help me build a learning plan for Spanish pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0962",
    "message": "study plan for AWS cert thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0963",
    "message": "study plan for AWS cert pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0964",
    "message": "study plan for AWS cert?",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0965",
    "message": "hey study plan for AWS cert",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0966",
    "message": "hey study plan for AWS cert thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0967",
    "message": "hey study plan for AWS cert pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0968",
    "message": "curriculum for learning Rust in 90 days thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0969",
    "message": "curriculum for learning Rust in 90 days pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0970",
    "message": "curriculum for learning Rust in 90 days?",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0971",
    "message": "hey curriculum for learning Rust in 90 days",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0972",
    "message": "hey curriculum for learning Rust in 90 days thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0973",
    "message": "hey curriculum for learning Rust in 90 days pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0974",
    "message": "how do I ship my side project faster? thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0975",
    "message": "how do I ship my side project faster? pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0976",
    "message": "how do I ship my side project faster??",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0977",
    "message": "hey how do I ship my side project faster?",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0978",
    "message": "hey how do I ship my side project faster? thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0979",
    "message": "hey how do I ship my side project faster? pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0980",
    "message": "unblock my app launch thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0981",
    "message": "unblock my app launch pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0982",
    "message": "unblock my app launch?",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0983",
    "message": "hey unblock my app launch",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0984",
    "message": "hey unblock my app launch thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0985",
    "message": "hey unblock my app launch pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0986",
    "message": "smallest next step on my portfolio site thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0987",
    "message": "smallest next step on my portfolio site pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0988",
    "message": "smallest next step on my portfolio site?",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0989",
    "message": "hey smallest next step on my portfolio site",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0990",
    "message": "hey smallest next step on my portfolio site thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0991",
    "message": "hey smallest next step on my portfolio site pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0992",
    "message": "prep for a promotion conversation thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0993",
    "message": "prep for a promotion conversation pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0994",
    "message": "prep for a promotion conversation?",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0995",
    "message": "hey prep for a promotion conversation",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0996",
    "message": "hey prep for a promotion conversation thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0997",
    "message": "hey prep for a promotion conversation pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0998",
    "message": "how do I position for a senior role? thanks",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-0999",
    "message": "how do I position for a senior role? pls",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  },
  {
    "id": "cmt-1000",
    "message": "how do I position for a senior role??",
    "source": "variation",
    "category": "wisdom",
    "structural": {
      "explicitMealLog": false,
      "magnusTools": false,
      "youtubeAction": false
    },
    "issueTags": []
  }
];
