import { Router } from 'express';
import partiesRouter from './parties';
import coaRouter from './coa';
import journalsRouter from './journals';
import inventoryRouter from './inventory';
import templateRouter from './template';

const router = Router();

router.use(partiesRouter);
router.use(coaRouter);
router.use(journalsRouter);
router.use(inventoryRouter);
router.use(templateRouter);

export default router;
