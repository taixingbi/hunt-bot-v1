https://hunt-bot-v1-dev.fly.dev



curl -s -X POST https://mcp-orchestrator-v1-dev.fly.dev/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "agent_graph_run_id": "019c6812-8428-7102-a8f0-1dddbe8373a9",
    "rating": "thumbs_down",
    "feedback_type": "not_factual",
    "question": "List 5 job titles in Ventura",
    "comment": "Only returned 3 titles"
  }'



  curl -s -X POST https://mcp-orchestrator-v1-dev.fly.dev/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "agent_graph_run_id": "019c6812-8428-7102-a8f0-1dddbe8373a9",
    "rating": "thumbs_down",
    "feedback_type": "not_factual",

    "comment": "Only returned 3 titles"
  }'