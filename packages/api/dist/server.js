import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthorizationMiddleware, readAuthorizationConfig } from './auth/authorization.js';
import { getPermitPeriods, getPermits, submitPermit, updatePermit } from './services/permitService.js';
import { createBlackoutDate, getBlackoutDates, parseBlackoutDate, updateBlackoutDate } from './services/blackoutDateService.js';
import { createSystemAvailableDate, deleteSystemAvailableDate, getSystemAvailableDates, parseSystemAvailableDate, updateSystemAvailableDate, } from './services/availabilityService.js';
import { createAdminPermitPeriod, getAdminPermitPeriods, parseAdminPermitPeriod, updateAdminPermitPeriod, } from './services/permitPeriodAdminService.js';
import { getAdminConfigurations, parseConfigurationValue, updateAdminConfiguration } from './services/configurationService.js';
import { getSystemHealth } from './services/systemHealthService.js';
dotenv.config();
export const app = express();
const port = Number(process.env.PORT || 3001);
const authorizationConfig = readAuthorizationConfig();
export const queryValue = (value) => {
    if (value === undefined || value === null)
        return null;
    if (Array.isArray(value))
        return value[0] ?? null;
    if (typeof value === 'string' || typeof value === 'number')
        return value;
    return String(value);
};
app.use(cors());
app.get('/api/auth-config', (_req, res) => {
    res.json({ authorizationEnabled: authorizationConfig.enabled });
});
app.use(createAuthorizationMiddleware(authorizationConfig));
app.use(express.json());
const healthCheck = (_req, res) => {
    res.json({ status: 'ok' });
};
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);
app.get('/api/system-health', async (_req, res) => {
    try {
        res.json(await getSystemHealth());
    }
    catch (error) {
        console.error('Error checking system health:', error);
        res.status(500).json({
            error: 'Failed to check system health',
            details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
        });
    }
});
app.get('/api/permits', async (req, res) => {
    try {
        const result = await getPermits({
            systemId: queryValue(req.query.systemId),
            startDate: typeof req.query.startDate === 'string' ? req.query.startDate : null,
            endDate: typeof req.query.endDate === 'string' ? req.query.endDate : null,
            page: queryValue(req.query.page),
            pageSize: queryValue(req.query.pageSize),
            sortField: typeof req.query.sortField === 'string' ? req.query.sortField : null,
            sortDirection: typeof req.query.sortDirection === 'string' ? req.query.sortDirection : null,
            search: typeof req.query.search === 'string' ? req.query.search : null,
        });
        res.json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching permits:', error);
        res.status(500).json({
            error: 'Failed to fetch permits',
            details: process.env.NODE_ENV === 'development' ? message : undefined,
        });
    }
});
app.get('/api/permit-periods', async (req, res) => {
    try {
        const systemId = Number(req.query.systemId || 1);
        res.json(await getPermitPeriods(Number.isInteger(systemId) ? systemId : 1));
    }
    catch (error) {
        console.error('Error fetching permit periods:', error);
        res.status(500).json({ error: 'Failed to fetch permit periods' });
    }
});
app.get('/api/blackout-dates', async (req, res) => {
    try {
        res.json(await getBlackoutDates(req.query.page, req.query.pageSize, req.query.sortField, req.query.sortDirection));
    }
    catch (error) {
        console.error('Error fetching blackout dates:', error);
        res.status(500).json({ error: 'Failed to fetch blackout dates' });
    }
});
app.post('/api/blackout-dates', async (req, res) => {
    const blackoutDate = parseBlackoutDate(req.body);
    if (!blackoutDate) {
        res.status(400).json({ error: 'A permit type of 1 or 2 and a valid blackout date are required' });
        return;
    }
    try {
        res.status(201).json(await createBlackoutDate(blackoutDate));
    }
    catch (error) {
        console.error('Error creating blackout date:', error);
        res.status(500).json({ error: 'Failed to create blackout date' });
    }
});
app.put('/api/blackout-dates/:id', async (req, res) => {
    const id = Number(req.params.id);
    const blackoutDate = parseBlackoutDate(req.body);
    if (!Number.isInteger(id) || id < 1 || !blackoutDate) {
        res.status(400).json({ error: 'A valid blackout date ID, permit type, and date are required' });
        return;
    }
    try {
        const updatedDate = await updateBlackoutDate(id, blackoutDate);
        if (!updatedDate) {
            res.status(404).json({ error: 'Blackout date not found' });
            return;
        }
        res.json(updatedDate);
    }
    catch (error) {
        console.error('Error updating blackout date:', error);
        res.status(500).json({ error: 'Failed to update blackout date' });
    }
});
app.get('/api/system-available-dates', async (req, res) => {
    try {
        res.json(await getSystemAvailableDates(req.query.page, req.query.pageSize));
    }
    catch (error) {
        console.error('Error fetching system availability dates:', error);
        res.status(500).json({ error: 'Failed to fetch system availability dates' });
    }
});
app.post('/api/system-available-dates', async (req, res) => {
    const date = parseSystemAvailableDate(req.body);
    if (!date) {
        res.status(400).json({ error: 'A valid campfire availability date, status, and comments are required' });
        return;
    }
    try {
        res.status(201).json(await createSystemAvailableDate(date));
    }
    catch (error) {
        console.error('Error creating system availability date:', error);
        res.status(500).json({ error: 'Failed to create system availability date' });
    }
});
app.put('/api/system-available-dates/:id', async (req, res) => {
    const id = Number(req.params.id);
    const date = parseSystemAvailableDate(req.body);
    if (!Number.isInteger(id) || id < 1 || !date) {
        res.status(400).json({ error: 'A valid system availability ID, date, status, and comments are required' });
        return;
    }
    try {
        const updatedDate = await updateSystemAvailableDate(id, date);
        if (!updatedDate) {
            res.status(404).json({ error: 'System availability date not found' });
            return;
        }
        res.json(updatedDate);
    }
    catch (error) {
        console.error('Error updating system availability date:', error);
        res.status(500).json({ error: 'Failed to update system availability date' });
    }
});
app.delete('/api/system-available-dates/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
        res.status(400).json({ error: 'A valid system availability ID is required' });
        return;
    }
    try {
        if (!await deleteSystemAvailableDate(id)) {
            res.status(404).json({ error: 'System availability date not found' });
            return;
        }
        res.status(204).send();
    }
    catch (error) {
        console.error('Error deleting system availability date:', error);
        res.status(500).json({ error: 'Failed to delete system availability date' });
    }
});
app.get('/api/periods', async (req, res) => {
    try {
        res.json(await getAdminPermitPeriods(req.query.page, req.query.pageSize, req.query.sortField, req.query.sortDirection, req.query.typeID));
    }
    catch (error) {
        console.error('Error fetching permit periods:', error);
        res.status(500).json({ error: 'Failed to fetch permit periods' });
    }
});
app.post('/api/periods', async (req, res) => {
    const period = parseAdminPermitPeriod(req.body);
    if (!period) {
        res.status(400).json({ error: 'A permit type, name, and valid period and booking dates are required' });
        return;
    }
    try {
        res.status(201).json(await createAdminPermitPeriod(period));
    }
    catch (error) {
        console.error('Error creating permit period:', error);
        res.status(500).json({ error: 'Failed to create permit period' });
    }
});
app.put('/api/periods/:id', async (req, res) => {
    const id = Number(req.params.id);
    const period = parseAdminPermitPeriod(req.body);
    if (!Number.isInteger(id) || id < 1 || !period) {
        res.status(400).json({ error: 'A valid permit period ID, permit type, name, and dates are required' });
        return;
    }
    try {
        const updatedPeriod = await updateAdminPermitPeriod(id, period);
        if (!updatedPeriod) {
            res.status(404).json({ error: 'Permit period not found' });
            return;
        }
        res.json(updatedPeriod);
    }
    catch (error) {
        console.error('Error updating permit period:', error);
        res.status(500).json({ error: 'Failed to update permit period' });
    }
});
app.get('/api/configurations', async (req, res) => {
    try {
        res.json(await getAdminConfigurations(req.query.page, req.query.pageSize));
    }
    catch (error) {
        console.error('Error fetching configurations:', error);
        res.status(500).json({ error: 'Failed to fetch configurations' });
    }
});
app.put('/api/configurations/:id', async (req, res) => {
    const id = Number(req.params.id);
    const value = parseConfigurationValue(req.body);
    if (!Number.isInteger(id) || id < 1 || value === null) {
        res.status(400).json({ error: 'A valid configuration ID and string value are required' });
        return;
    }
    try {
        const updatedConfiguration = await updateAdminConfiguration(id, value);
        if (!updatedConfiguration) {
            res.status(404).json({ error: 'Admin-editable configuration not found' });
            return;
        }
        res.json(updatedConfiguration);
    }
    catch (error) {
        console.error('Error updating configuration:', error);
        res.status(500).json({ error: 'Failed to update configuration' });
    }
});
app.post('/api/permits', async (req, res) => {
    const body = req.body;
    const requiredFields = ['permitType', 'permitPeriod', 'streetNumber', 'streetName', 'firstName', 'lastName', 'phoneNumber', 'email', 'requestedDate'];
    const missingField = requiredFields.find((field) => body[field] === undefined || body[field] === '');
    if (missingField || (body.permitType !== 'open-burn' && body.permitType !== 'campfire')) {
        res.status(400).json({ error: 'Permit type and all applicant, address, and date fields are required' });
        return;
    }
    if (body.permitType === 'campfire' && (body.permitStartTime === undefined || body.permitEndTime === undefined)) {
        res.status(400).json({ error: 'Campfire permits require a start and end time' });
        return;
    }
    if (body.permitType === 'campfire') {
        const startTime = body.permitStartTime;
        const endTime = body.permitEndTime;
        if (typeof startTime !== 'number' || !Number.isInteger(startTime) || startTime < 0 || startTime > 21 || endTime !== startTime + 3) {
            res.status(400).json({ error: 'Campfire start time must be between 0 and 21, with the end time three hours later' });
            return;
        }
    }
    try {
        const result = await submitPermit(body);
        res.status(201).json(result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error submitting permit:', error);
        res.status(500).json({
            error: 'Failed to submit permit',
            details: process.env.NODE_ENV === 'development' ? message : undefined,
        });
    }
});
app.put('/api/permits/:id', async (req, res) => {
    const permitId = Number(req.params.id);
    const body = req.body;
    const requiredFields = ['firstName', 'lastName', 'phoneNumber', 'email', 'streetNumber', 'streetName', 'permitDate', 'permitStatus', 'permitType', 'permitPeriod'];
    const missingField = requiredFields.find((field) => {
        const value = body[field];
        return value === undefined || value === null || value === '';
    });
    if (!Number.isInteger(permitId) || permitId < 1 || missingField) {
        res.status(400).json({ error: 'Permit id and all editable permit fields are required' });
        return;
    }
    try {
        await updatePermit({ permitId, ...body });
        res.status(204).send();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error updating permit:', error);
        res.status(500).json({
            error: 'Failed to update permit',
            details: process.env.NODE_ENV === 'development' ? message : undefined,
        });
    }
});
export function startServer() {
    return app.listen(port, () => {
        console.log(`Permit Admin API listening on http://localhost:${port}`);
    });
}
const entryPath = process.env.pm_exec_path || process.argv[1];
const isMainModule = entryPath ? resolve(entryPath) === fileURLToPath(import.meta.url) : false;
if (isMainModule) {
    startServer();
}
