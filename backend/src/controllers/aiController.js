const db = require('../config/database');
const geminiService = require('../services/geminiService');

class AIController {
  async sendMessage(req, res) {
    try {
      console.log('🤖 AI message request received from user:', req.user?.id);
      
      const userId = req.user.id;
      const { prompt } = req.body;

      if (!prompt || prompt.trim().length === 0) {
        console.log('🤖 Empty prompt received');
        return res.status(400).json({
          success: false,
          message: 'Prompt is required and cannot be empty'
        });
      }

      console.log('🤖 Processing prompt:', prompt.substring(0, 100) + '...');

      // Check if AI service is available - use fallback if not
      let aiResponse;
      try {
        // Get conversation history for context
        console.log('🤖 Fetching conversation history...');
        const historyResult = await db.query(
          `SELECT prompt, response, created_at
           FROM ai_chats 
           WHERE user_id = $1 
           ORDER BY created_at DESC 
           LIMIT 10`,
          [userId]
        );

        console.log('🤖 Retrieved conversation history:', historyResult.rows.length, 'messages');

        // Format conversation history
        const conversationHistory = historyResult.rows.reverse().map(chat => [
          { content: chat.prompt, isUser: true },
          { content: chat.response, isUser: false }
        ]).flat();

        // Generate AI response
        console.log('🤖 Generating AI response...');
        aiResponse = await geminiService.generateResponse(prompt, conversationHistory);
        
        console.log('🤖 AI response generated:', {
          success: aiResponse.success,
          hasResponse: !!aiResponse.response,
          isFallback: aiResponse.fallback
        });
      } catch (aiError) {
        console.error('🤖 AI service error:', aiError.message);
        // Create fallback response
        aiResponse = {
          success: false,
          fallback: true,
          response: "I'm sorry, I'm experiencing some technical difficulties right now. Please try again in a moment. 🤖",
          error: aiError.message
        };
      }

      if (!aiResponse.success && !aiResponse.fallback) {
        console.error('🤖 AI response generation failed:', aiResponse.error);
        return res.status(500).json({
          success: false,
          message: 'Failed to generate AI response',
          error: aiResponse.error
        });
      }

      // Use fallback response if AI service is unavailable
      const responseText = aiResponse.response;
      const isFallback = aiResponse.fallback || false;

      console.log('🤖 Saving conversation to database...');

      // Save conversation to database
      const chatResult = await db.query(
        `INSERT INTO ai_chats (user_id, prompt, response, conversation_context)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          userId,
          prompt,
          responseText,
          JSON.stringify({
            tokensUsed: aiResponse.tokensUsed || 0,
            timestamp: new Date().toISOString(),
            contextLength: conversationHistory.length,
            fallback: isFallback
          })
        ]
      );

      const chat = chatResult.rows[0];
      console.log('🤖 Conversation saved with ID:', chat.id);

      // Get user details for the response
      const userResult = await db.query(
        'SELECT first_name, last_name, profile_photo FROM users WHERE id = $1',
        [userId]
      );

      const user = userResult.rows[0];

      // Format response as a message-like object for consistency with regular chat
      const aiMessage = {
        id: chat.id,
        type: 'ai_chat',
        user_message: {
          content: prompt,
          sender: {
            id: userId,
            first_name: user.first_name,
            last_name: user.last_name,
            full_name: `${user.first_name} ${user.last_name}`,
            profile_photo: user.profile_photo
          },
          created_at: chat.created_at
        },
        ai_response: {
          content: responseText,
          sender: {
            id: 'ai_assistant',
            first_name: 'AI',
            last_name: 'Assistant',
            full_name: 'AI Assistant',
            profile_photo: null
          },
          created_at: chat.created_at
        },
        created_at: chat.created_at
      };

      // Try to emit real-time update to user (if Socket.IO is available)
      try {
        if (req.app.get('io')) {
          req.app.get('io').to(`user_${userId}`).emit('ai_message', aiMessage);
        }
      } catch (socketError) {
        console.log('🤖 Socket.IO not available (expected in serverless)');
      }

      res.status(201).json({
        success: true,
        message: isFallback ? 'AI response generated (fallback mode)' : 'AI response generated successfully',
        response: responseText, // Add direct response field for frontend
        data: { chat: aiMessage }
      });

    } catch (error) {
      console.error('🤖 AI message error:', error);
      console.error('🤖 Error stack:', error.stack);
      
      // Try to provide a fallback response even if there's an error
      try {
        const fallbackResponse = "I'm sorry, I'm experiencing some technical difficulties right now. Please try again in a moment. 🤖";
        
        res.status(200).json({
          success: true,
          message: 'AI response generated (emergency fallback)',
          response: fallbackResponse,
          data: { 
            chat: {
              id: null,
              prompt: req.body.prompt || '',
              response: fallbackResponse,
              created_at: new Date().toISOString(),
              is_fallback: true
            }
          }
        });
      } catch (fallbackError) {
        console.error('🤖 Even fallback failed:', fallbackError);
        res.status(500).json({
          success: false,
          message: 'Failed to process AI message',
          error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
      }
    }
  }

  async getConversation(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;

      const result = await db.query(
        `SELECT * FROM ai_chats 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      // Get user details
      const userResult = await db.query(
        'SELECT first_name, last_name, profile_photo FROM users WHERE id = $1',
        [userId]
      );

      const user = userResult.rows[0];

      // Format as message-like objects
      const conversation = result.rows.map(chat => ({
        id: chat.id,
        type: 'ai_chat',
        user_message: {
          content: chat.prompt,
          sender: {
            id: userId,
            first_name: user.first_name,
            last_name: user.last_name,
            full_name: `${user.first_name} ${user.last_name}`,
            profile_photo: user.profile_photo
          },
          created_at: chat.created_at
        },
        ai_response: {
          content: chat.response,
          sender: {
            id: 'ai_assistant',
            first_name: 'AI',
            last_name: 'Assistant',
            full_name: 'AI Assistant',
            profile_photo: null
          },
          created_at: chat.created_at
        },
        created_at: chat.created_at,
        context: chat.conversation_context
      })).reverse(); // Show oldest first for conversation flow

      res.json({
        success: true,
        data: {
          conversation,
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            has_more: result.rows.length === parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('Get AI conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get AI conversation',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  async streamMessage(req, res) {
    try {
      const userId = req.user.id;
      const { prompt } = req.body;

      // Set up Server-Sent Events
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // Get conversation history
      const historyResult = await db.query(
        `SELECT prompt, response, created_at
         FROM ai_chats 
         WHERE user_id = $1 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [userId]
      );

      const conversationHistory = historyResult.rows.reverse().map(chat => [
        { content: chat.prompt, isUser: true },
        { content: chat.response, isUser: false }
      ]).flat();

      try {
        // Get streaming response from Gemini
        const stream = await geminiService.generateStreamResponse(prompt, conversationHistory);
        
        let fullResponse = '';

        // Send initial message
        res.write(`data: ${JSON.stringify({ type: 'start', message: 'AI is typing...' })}\n\n`);

        // Process stream
        for await (const chunk of stream) {
          const chunkText = chunk.text();
          fullResponse += chunkText;
          
          // Send chunk to client
          res.write(`data: ${JSON.stringify({ 
            type: 'chunk', 
            content: chunkText,
            fullContent: fullResponse 
          })}\n\n`);
        }

        // Save complete conversation
        const chatResult = await db.query(
          `INSERT INTO ai_chats (user_id, prompt, response, conversation_context)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [
            userId,
            prompt,
            fullResponse,
            JSON.stringify({
              tokensUsed: geminiService.estimateTokens(prompt + fullResponse),
              timestamp: new Date().toISOString(),
              contextLength: conversationHistory.length,
              streamed: true
            })
          ]
        );

        const chat = chatResult.rows[0];

        // Send completion message
        res.write(`data: ${JSON.stringify({ 
          type: 'complete', 
          chatId: chat.id,
          fullResponse: fullResponse,
          timestamp: chat.created_at
        })}\n\n`);

        res.write('data: [DONE]\n\n');
        res.end();

      } catch (streamError) {
        console.error('Stream error:', streamError);
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          message: 'Sorry, I encountered an error while processing your message. Please try again.' 
        })}\n\n`);
        res.end();
      }

    } catch (error) {
      console.error('AI stream error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stream AI response',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  async clearConversation(req, res) {
    try {
      const userId = req.user.id;

      await db.query(
        'DELETE FROM ai_chats WHERE user_id = $1',
        [userId]
      );

      res.json({
        success: true,
        message: 'AI conversation cleared successfully'
      });

    } catch (error) {
      console.error('Clear AI conversation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear AI conversation',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  async getAIStats(req, res) {
    try {
      const userId = req.user.id;

      const statsResult = await db.query(
        `SELECT 
           COUNT(*) as total_conversations,
           COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END) as today_conversations,
           COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_conversations,
           AVG(LENGTH(prompt)) as avg_prompt_length,
           AVG(LENGTH(response)) as avg_response_length,
           MIN(created_at) as first_conversation,
           MAX(created_at) as last_conversation
         FROM ai_chats 
         WHERE user_id = $1`,
        [userId]
      );

      const stats = statsResult.rows[0];

      // Get activity by day (last 7 days)
      const activityResult = await db.query(
        `SELECT 
           DATE(created_at) as date,
           COUNT(*) as conversation_count
         FROM ai_chats 
         WHERE user_id = $1 
           AND created_at >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        [userId]
      );

      res.json({
        success: true,
        data: {
          stats: {
            total_conversations: parseInt(stats.total_conversations),
            today_conversations: parseInt(stats.today_conversations),
            week_conversations: parseInt(stats.week_conversations),
            avg_prompt_length: Math.round(parseFloat(stats.avg_prompt_length) || 0),
            avg_response_length: Math.round(parseFloat(stats.avg_response_length) || 0),
            first_conversation: stats.first_conversation,
            last_conversation: stats.last_conversation
          },
          activity: activityResult.rows
        }
      });

    } catch (error) {
      console.error('Get AI stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get AI statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  async healthCheck(req, res) {
    try {
      const health = await geminiService.healthCheck();
      
      res.json({
        success: true,
        data: {
          service_status: health.status,
          response: health.response,
          error: health.error
        }
      });

    } catch (error) {
      console.error('AI health check error:', error);
      res.status(500).json({
        success: false,
        message: 'AI service health check failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
}

module.exports = new AIController();