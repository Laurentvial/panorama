import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

app.use('*', cors());
app.use('*', logger(console.log));

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ============== AUTH ==============

// Signup
app.post('/make-server-35b53642/auth/signup', async (c) => {
  try {
    const { email, password, firstName, lastName, phone, mobile, role, teamId } = await c.req.json();
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since email server not configured
      user_metadata: { firstName, lastName, phone, mobile, role, teamId }
    });
    
    if (authError) throw authError;
    
    // Store user details in KV
    await kv.set(`user:${authData.user.id}`, {
      id: authData.user.id,
      email,
      firstName,
      lastName,
      phone,
      mobile,
      role,
      teamId,
      active: true,
      createdAt: new Date().toISOString()
    });
    
    // Add user to team members if teamId provided
    if (teamId) {
      const membersKey = `team_members:${teamId}`;
      const members = await kv.get(membersKey) || [];
      members.push({
        userId: authData.user.id,
        role: role,
        isLeader: false,
        addedAt: new Date().toISOString()
      });
      await kv.set(membersKey, members);
    }
    
    return c.json({ success: true, user: authData.user });
  } catch (error) {
    console.log(`Error in signup: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get current user
app.get('/make-server-35b53642/auth/me', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    if (!token) return c.json({ error: 'No token provided' }, 401);
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const userData = await kv.get(`user:${user.id}`);
    return c.json({ user: userData || user });
  } catch (error) {
    console.log(`Error getting user: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== TEAMS ==============

// Create team
app.post('/make-server-35b53642/teams', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const { name } = await c.req.json();
    const teamId = crypto.randomUUID();
    
    const team = {
      id: teamId,
      name,
      createdAt: new Date().toISOString(),
      createdBy: user.id
    };
    
    await kv.set(`team:${teamId}`, team);
    await kv.set(`team_members:${teamId}`, []);
    
    return c.json({ success: true, team });
  } catch (error) {
    console.log(`Error creating team: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get all teams
app.get('/make-server-35b53642/teams', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const teams = await kv.getByPrefix('team:');
    return c.json({ teams });
  } catch (error) {
    console.log(`Error getting teams: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get team by ID
app.get('/make-server-35b53642/teams/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const teamId = c.req.param('id');
    const team = await kv.get(`team:${teamId}`);
    const members = await kv.get(`team_members:${teamId}`) || [];
    
    // Get member details
    const memberDetails = await Promise.all(
      members.map(async (member: any) => {
        const userData = await kv.get(`user:${member.userId}`);
        return { ...member, userData };
      })
    );
    
    return c.json({ team, members: memberDetails });
  } catch (error) {
    console.log(`Error getting team: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update team
app.put('/make-server-35b53642/teams/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const teamId = c.req.param('id');
    const { name } = await c.req.json();
    
    const team = await kv.get(`team:${teamId}`);
    if (!team) return c.json({ error: 'Team not found' }, 404);
    
    team.name = name;
    team.updatedAt = new Date().toISOString();
    
    await kv.set(`team:${teamId}`, team);
    return c.json({ success: true, team });
  } catch (error) {
    console.log(`Error updating team: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Delete team
app.delete('/make-server-35b53642/teams/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const teamId = c.req.param('id');
    await kv.del(`team:${teamId}`);
    await kv.del(`team_members:${teamId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting team: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Add user to team
app.post('/make-server-35b53642/teams/:id/members', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const teamId = c.req.param('id');
    const { userId, isLeader } = await c.req.json();
    
    const members = await kv.get(`team_members:${teamId}`) || [];
    members.push({
      userId,
      isLeader: isLeader || false,
      addedAt: new Date().toISOString()
    });
    
    await kv.set(`team_members:${teamId}`, members);
    
    // Update user's teamId
    const userData = await kv.get(`user:${userId}`);
    if (userData) {
      userData.teamId = teamId;
      await kv.set(`user:${userId}`, userData);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error adding team member: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Remove user from team
app.delete('/make-server-35b53642/teams/:teamId/members/:userId', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const teamId = c.req.param('teamId');
    const userId = c.req.param('userId');
    
    const members = await kv.get(`team_members:${teamId}`) || [];
    const filtered = members.filter((m: any) => m.userId !== userId);
    await kv.set(`team_members:${teamId}`, filtered);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error removing team member: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== USERS ==============

// Get all users
app.get('/make-server-35b53642/users', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const users = await kv.getByPrefix('user:');
    return c.json({ users });
  } catch (error) {
    console.log(`Error getting users: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update user
app.put('/make-server-35b53642/users/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const userId = c.req.param('id');
    const updates = await c.req.json();
    
    const userData = await kv.get(`user:${userId}`);
    if (!userData) return c.json({ error: 'User not found' }, 404);
    
    const updated = { ...userData, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`user:${userId}`, updated);
    
    return c.json({ success: true, user: updated });
  } catch (error) {
    console.log(`Error updating user: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Toggle user active status
app.post('/make-server-35b53642/users/:id/toggle-active', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const userId = c.req.param('id');
    const userData = await kv.get(`user:${userId}`);
    if (!userData) return c.json({ error: 'User not found' }, 404);
    
    userData.active = !userData.active;
    await kv.set(`user:${userId}`, userData);
    
    return c.json({ success: true, active: userData.active });
  } catch (error) {
    console.log(`Error toggling user status: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Delete user
app.delete('/make-server-35b53642/users/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const userId = c.req.param('id');
    await kv.del(`user:${userId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting user: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== CLIENTS ==============

// Create client
app.post('/make-server-35b53642/clients', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientData = await c.req.json();
    const clientId = crypto.randomUUID();
    
    // Create auth account for client if password provided
    if (clientData.password) {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: clientData.email,
        password: clientData.password,
        email_confirm: true,
        user_metadata: { 
          firstName: clientData.firstName,
          lastName: clientData.lastName,
          role: 'client'
        }
      });
      
      if (!authError && authData) {
        clientData.authId = authData.user.id;
      }
    }
    
    const client = {
      id: clientId,
      ...clientData,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: user.id
    };
    
    await kv.set(`client:${clientId}`, client);
    
    return c.json({ success: true, client });
  } catch (error) {
    console.log(`Error creating client: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get all clients
app.get('/make-server-35b53642/clients', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clients = await kv.getByPrefix('client:');
    return c.json({ clients });
  } catch (error) {
    console.log(`Error getting clients: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get client by ID
app.get('/make-server-35b53642/clients/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('id');
    const client = await kv.get(`client:${clientId}`);
    
    if (!client) return c.json({ error: 'Client not found' }, 404);
    
    // Get additional client data
    const patrimoine = await kv.get(`client_patrimoine:${clientId}`);
    const products = await kv.get(`client_products:${clientId}`);
    const amounts = await kv.get(`client_amounts:${clientId}`);
    
    return c.json({ client, patrimoine, products, amounts });
  } catch (error) {
    console.log(`Error getting client: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update client
app.put('/make-server-35b53642/clients/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('id');
    const updates = await c.req.json();
    
    const client = await kv.get(`client:${clientId}`);
    if (!client) return c.json({ error: 'Client not found' }, 404);
    
    const updated = { ...client, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`client:${clientId}`, updated);
    
    return c.json({ success: true, client: updated });
  } catch (error) {
    console.log(`Error updating client: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update client patrimoine
app.put('/make-server-35b53642/clients/:id/patrimoine', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('id');
    const patrimoine = await c.req.json();
    
    await kv.set(`client_patrimoine:${clientId}`, patrimoine);
    
    return c.json({ success: true, patrimoine });
  } catch (error) {
    console.log(`Error updating patrimoine: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update client products
app.put('/make-server-35b53642/clients/:id/products', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('id');
    const products = await c.req.json();
    
    await kv.set(`client_products:${clientId}`, products);
    
    return c.json({ success: true, products });
  } catch (error) {
    console.log(`Error updating client products: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update client amounts
app.put('/make-server-35b53642/clients/:id/amounts', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('id');
    const amounts = await c.req.json();
    
    await kv.set(`client_amounts:${clientId}`, amounts);
    
    return c.json({ success: true, amounts });
  } catch (error) {
    console.log(`Error updating client amounts: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Toggle client active status
app.post('/make-server-35b53642/clients/:id/toggle-active', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('id');
    const client = await kv.get(`client:${clientId}`);
    if (!client) return c.json({ error: 'Client not found' }, 404);
    
    client.active = !client.active;
    await kv.set(`client:${clientId}`, client);
    
    return c.json({ success: true, active: client.active });
  } catch (error) {
    console.log(`Error toggling client status: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Delete client
app.delete('/make-server-35b53642/clients/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('id');
    await kv.del(`client:${clientId}`);
    await kv.del(`client_patrimoine:${clientId}`);
    await kv.del(`client_products:${clientId}`);
    await kv.del(`client_amounts:${clientId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting client: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== TRANSACTIONS ==============

// Create transaction
app.post('/make-server-35b53642/transactions', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const transactionData = await c.req.json();
    const transactionId = crypto.randomUUID();
    
    const transaction = {
      id: transactionId,
      ...transactionData,
      createdAt: new Date().toISOString(),
      createdBy: user.id
    };
    
    await kv.set(`transaction:${transactionId}`, transaction);
    
    return c.json({ success: true, transaction });
  } catch (error) {
    console.log(`Error creating transaction: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get all transactions
app.get('/make-server-35b53642/transactions', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const transactions = await kv.getByPrefix('transaction:');
    return c.json({ transactions });
  } catch (error) {
    console.log(`Error getting transactions: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get transactions by client
app.get('/make-server-35b53642/clients/:clientId/transactions', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('clientId');
    const allTransactions = await kv.getByPrefix('transaction:');
    const clientTransactions = allTransactions.filter((t: any) => t.clientId === clientId);
    
    return c.json({ transactions: clientTransactions });
  } catch (error) {
    console.log(`Error getting client transactions: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update transaction
app.put('/make-server-35b53642/transactions/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const transactionId = c.req.param('id');
    const updates = await c.req.json();
    
    const transaction = await kv.get(`transaction:${transactionId}`);
    if (!transaction) return c.json({ error: 'Transaction not found' }, 404);
    
    const updated = { ...transaction, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`transaction:${transactionId}`, updated);
    
    return c.json({ success: true, transaction: updated });
  } catch (error) {
    console.log(`Error updating transaction: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Delete transaction
app.delete('/make-server-35b53642/transactions/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const transactionId = c.req.param('id');
    await kv.del(`transaction:${transactionId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting transaction: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== APPOINTMENTS ==============

// Create appointment
app.post('/make-server-35b53642/appointments', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const appointmentData = await c.req.json();
    const appointmentId = crypto.randomUUID();
    
    const appointment = {
      id: appointmentId,
      ...appointmentData,
      createdAt: new Date().toISOString(),
      createdBy: user.id
    };
    
    await kv.set(`appointment:${appointmentId}`, appointment);
    
    return c.json({ success: true, appointment });
  } catch (error) {
    console.log(`Error creating appointment: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get all appointments
app.get('/make-server-35b53642/appointments', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const appointments = await kv.getByPrefix('appointment:');
    return c.json({ appointments });
  } catch (error) {
    console.log(`Error getting appointments: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get appointments by client
app.get('/make-server-35b53642/clients/:clientId/appointments', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('clientId');
    const allAppointments = await kv.getByPrefix('appointment:');
    const clientAppointments = allAppointments.filter((a: any) => a.clientId === clientId);
    
    return c.json({ appointments: clientAppointments });
  } catch (error) {
    console.log(`Error getting client appointments: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update appointment
app.put('/make-server-35b53642/appointments/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const appointmentId = c.req.param('id');
    const updates = await c.req.json();
    
    const appointment = await kv.get(`appointment:${appointmentId}`);
    if (!appointment) return c.json({ error: 'Appointment not found' }, 404);
    
    const updated = { ...appointment, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`appointment:${appointmentId}`, updated);
    
    return c.json({ success: true, appointment: updated });
  } catch (error) {
    console.log(`Error updating appointment: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Delete appointment
app.delete('/make-server-35b53642/appointments/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const appointmentId = c.req.param('id');
    await kv.del(`appointment:${appointmentId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting appointment: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== NOTES ==============

// Create note
app.post('/make-server-35b53642/clients/:clientId/notes', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('clientId');
    const { text } = await c.req.json();
    const noteId = crypto.randomUUID();
    
    const note = {
      id: noteId,
      clientId,
      text,
      createdAt: new Date().toISOString(),
      createdBy: user.id
    };
    
    await kv.set(`note:${clientId}:${noteId}`, note);
    
    return c.json({ success: true, note });
  } catch (error) {
    console.log(`Error creating note: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get notes by client
app.get('/make-server-35b53642/clients/:clientId/notes', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('clientId');
    const notes = await kv.getByPrefix(`note:${clientId}:`);
    
    return c.json({ notes });
  } catch (error) {
    console.log(`Error getting notes: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update note
app.put('/make-server-35b53642/clients/:clientId/notes/:noteId', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('clientId');
    const noteId = c.req.param('noteId');
    const { text } = await c.req.json();
    
    const note = await kv.get(`note:${clientId}:${noteId}`);
    if (!note) return c.json({ error: 'Note not found' }, 404);
    
    note.text = text;
    note.updatedAt = new Date().toISOString();
    
    await kv.set(`note:${clientId}:${noteId}`, note);
    
    return c.json({ success: true, note });
  } catch (error) {
    console.log(`Error updating note: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Delete note
app.delete('/make-server-35b53642/clients/:clientId/notes/:noteId', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const clientId = c.req.param('clientId');
    const noteId = c.req.param('noteId');
    
    await kv.del(`note:${clientId}:${noteId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting note: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== MESSAGES ==============

// Send message
app.post('/make-server-35b53642/messages', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const messageData = await c.req.json();
    const messageId = crypto.randomUUID();
    
    const message = {
      id: messageId,
      ...messageData,
      read: false,
      createdAt: new Date().toISOString(),
      senderId: user.id
    };
    
    await kv.set(`message:${messageId}`, message);
    
    return c.json({ success: true, message });
  } catch (error) {
    console.log(`Error sending message: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get messages for user
app.get('/make-server-35b53642/messages', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const allMessages = await kv.getByPrefix('message:');
    const userMessages = allMessages.filter((m: any) => 
      m.senderId === user.id || m.recipientId === user.id
    );
    
    return c.json({ messages: userMessages });
  } catch (error) {
    console.log(`Error getting messages: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Mark message as read
app.post('/make-server-35b53642/messages/:id/read', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const messageId = c.req.param('id');
    const message = await kv.get(`message:${messageId}`);
    if (!message) return c.json({ error: 'Message not found' }, 404);
    
    message.read = true;
    await kv.set(`message:${messageId}`, message);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error marking message as read: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Delete message
app.delete('/make-server-35b53642/messages/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const messageId = c.req.param('id');
    await kv.del(`message:${messageId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting message: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== PRODUCTS ==============

// Create product
app.post('/make-server-35b53642/products', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const productData = await c.req.json();
    const productId = crypto.randomUUID();
    
    const product = {
      id: productId,
      ...productData,
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: user.id
    };
    
    await kv.set(`product:${productId}`, product);
    
    return c.json({ success: true, product });
  } catch (error) {
    console.log(`Error creating product: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get all products
app.get('/make-server-35b53642/products', async (c) => {
  try {
    const products = await kv.getByPrefix('product:');
    return c.json({ products });
  } catch (error) {
    console.log(`Error getting products: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update product
app.put('/make-server-35b53642/products/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const productId = c.req.param('id');
    const updates = await c.req.json();
    
    const product = await kv.get(`product:${productId}`);
    if (!product) return c.json({ error: 'Product not found' }, 404);
    
    const updated = { ...product, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`product:${productId}`, updated);
    
    return c.json({ success: true, product: updated });
  } catch (error) {
    console.log(`Error updating product: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Toggle product active status
app.post('/make-server-35b53642/products/:id/toggle-active', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const productId = c.req.param('id');
    const product = await kv.get(`product:${productId}`);
    if (!product) return c.json({ error: 'Product not found' }, 404);
    
    product.active = !product.active;
    await kv.set(`product:${productId}`, product);
    
    return c.json({ success: true, active: product.active });
  } catch (error) {
    console.log(`Error toggling product status: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Delete product
app.delete('/make-server-35b53642/products/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const productId = c.req.param('id');
    await kv.del(`product:${productId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting product: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== CATEGORIES ==============

// Create category
app.post('/make-server-35b53642/categories', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const categoryData = await c.req.json();
    const categoryId = crypto.randomUUID();
    
    const category = {
      id: categoryId,
      ...categoryData,
      createdAt: new Date().toISOString(),
      createdBy: user.id
    };
    
    await kv.set(`category:${categoryId}`, category);
    
    return c.json({ success: true, category });
  } catch (error) {
    console.log(`Error creating category: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Get all categories
app.get('/make-server-35b53642/categories', async (c) => {
  try {
    const categories = await kv.getByPrefix('category:');
    return c.json({ categories });
  } catch (error) {
    console.log(`Error getting categories: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Update category
app.put('/make-server-35b53642/categories/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const categoryId = c.req.param('id');
    const updates = await c.req.json();
    
    const category = await kv.get(`category:${categoryId}`);
    if (!category) return c.json({ error: 'Category not found' }, 404);
    
    const updated = { ...category, ...updates, updatedAt: new Date().toISOString() };
    await kv.set(`category:${categoryId}`, updated);
    
    return c.json({ success: true, category: updated });
  } catch (error) {
    console.log(`Error updating category: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// Delete category
app.delete('/make-server-35b53642/categories/:id', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const categoryId = c.req.param('id');
    await kv.del(`category:${categoryId}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.log(`Error deleting category: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

// ============== STATISTICS ==============

// Get dashboard statistics
app.get('/make-server-35b53642/stats', async (c) => {
  try {
    const token = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return c.json({ error: 'Unauthorized' }, 401);
    
    const transactions = await kv.getByPrefix('transaction:');
    const clients = await kv.getByPrefix('client:');
    const appointments = await kv.getByPrefix('appointment:');
    const messages = await kv.getByPrefix('message:');
    
    // Calculate statistics
    const totalRevenue = transactions
      .filter((t: any) => t.type === 'depot' && t.status === 'validé')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    
    const pendingRevenue = transactions
      .filter((t: any) => t.type === 'depot' && t.status === 'en attente')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    
    const totalClients = clients.length;
    const totalAppointments = appointments.length;
    const unreadMessages = messages.filter((m: any) => !m.read && m.recipientId === user.id).length;
    
    return c.json({
      totalRevenue,
      pendingRevenue,
      totalClients,
      totalAppointments,
      unreadMessages,
      recentTransactions: transactions.slice(0, 10),
      recentMessages: messages.slice(0, 5)
    });
  } catch (error) {
    console.log(`Error getting statistics: ${error}`);
    return c.json({ error: error.message }, 400);
  }
});

Deno.serve(app.fetch);
