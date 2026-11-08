USE [master];
GO
IF DB_ID(N'RetailOnePOS') IS NOT NULL
BEGIN
    ALTER DATABASE [RetailOnePOS] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [RetailOnePOS];
END
GO
CREATE DATABASE [RetailOnePOS];
GO
USE [RetailOnePOS];
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;   -- required by the filtered unique indexes below
GO

/* =====================================================================
   1. AUTHENTICATION, RBAC, STAFF, SHIFTS            (FE-05)
   ===================================================================== */

-- [OLD] Roles: Manager / Cashier / Warehouse
CREATE TABLE [dbo].[Roles] (
    [id]          INT IDENTITY(1,1) NOT NULL,
    [name]        NVARCHAR(50)  NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_Roles]      PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Roles_Name] UNIQUE ([name])
);
GO

-- [OLD] Features = permission keys used by protect(PERMISSIONS.X)
CREATE TABLE [dbo].[Features] (
    [id]          INT IDENTITY(1,1) NOT NULL,
    [featureKey]  VARCHAR(100)  NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_Features]            PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Features_FeatureKey] UNIQUE ([featureKey])
);
GO

-- [OLD] Role <-> Feature (many to many)
CREATE TABLE [dbo].[RoleFeatures] (
    [roleId]    INT NOT NULL,
    [featureId] INT NOT NULL,
    CONSTRAINT [PK_RoleFeatures] PRIMARY KEY CLUSTERED ([roleId], [featureId]),
    CONSTRAINT [FK_RoleFeature_Role]    FOREIGN KEY ([roleId])    REFERENCES [dbo].[Roles]([id])    ON DELETE CASCADE,
    CONSTRAINT [FK_RoleFeature_Feature] FOREIGN KEY ([featureId]) REFERENCES [dbo].[Features]([id]) ON DELETE CASCADE
);
GO

-- [OLD+] Users. requirePasswordChange = BR-01 (first login / after reset).
--        isActive keeps the legacy 'active'/'locked' values (UC-66, UC-67, BR-03).
CREATE TABLE [dbo].[Users] (
    [id]                    INT IDENTITY(1,1) NOT NULL,
    [roleId]                INT           NOT NULL,
    [username]              VARCHAR(50)   NOT NULL,
    [passwordHash]          VARCHAR(255)  NOT NULL,
    [isActive]              VARCHAR(20)   NOT NULL CONSTRAINT [DF_Users_IsActive] DEFAULT ('active'),
    [requirePasswordChange] BIT           NOT NULL CONSTRAINT [DF_Users_ReqPwdChange] DEFAULT (1),
    [createdAt]             DATETIME2(7)  NOT NULL CONSTRAINT [DF_Users_CreatedAt] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Users]          PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Users_Username] UNIQUE ([username]),
    CONSTRAINT [FK_Users_Roles]    FOREIGN KEY ([roleId]) REFERENCES [dbo].[Roles]([id]),
    CONSTRAINT [CK_Users_Status]   CHECK ([isActive] IN ('active', 'locked'))
);
GO

-- [OLD] Staff. A staff row may exist without a login (userId NULL).
--       Unique indexes are filtered so several NULLs are allowed.
CREATE TABLE [dbo].[Staff] (
    [id]               BIGINT IDENTITY(1,1) NOT NULL,
    [userId]           INT           NOT NULL,   -- entity diagram: each Staff has exactly one User
    [fullName]         NVARCHAR(100) NOT NULL,
    [phoneNumber]      VARCHAR(20)   NOT NULL,
    [email]            VARCHAR(100)  NULL,
    [salaryType]       VARCHAR(20)   NOT NULL CONSTRAINT [DF_Staff_SalaryType] DEFAULT ('hourly'),
    [baseSalary]       DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Staff_BaseSalary] DEFAULT (0),
    [employmentStatus] VARCHAR(20)   NOT NULL CONSTRAINT [DF_Staff_EmpStatus]  DEFAULT ('working'),
    -- idCard: UC-64 step 2 (sensitive - expose only to DETAIL_STAFF / Manager). resignationDate: UC-67 step 2.
    [idCard]           VARCHAR(20)   NULL,
    [resignationDate]  DATE          NULL,
    [createdAt]        DATETIME2(7)  NOT NULL CONSTRAINT [DF_Staff_CreatedAt]  DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Staff]            PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Staff_Phone]      UNIQUE ([phoneNumber]),
    CONSTRAINT [UQ_Staff_User]       UNIQUE ([userId]),
    CONSTRAINT [FK_Staff_User]       FOREIGN KEY ([userId]) REFERENCES [dbo].[Users]([id]),
    CONSTRAINT [CK_Staff_SalaryType] CHECK ([salaryType] IN ('monthly', 'hourly')),
    CONSTRAINT [CK_Staff_Status]     CHECK ([employmentStatus] IN ('working', 'resigned')),
    CONSTRAINT [CK_Staff_BaseSalary] CHECK ([baseSalary] >= 0),
    CONSTRAINT [CK_Staff_IdCard]     CHECK ([idCard] IS NULL OR [idCard] NOT LIKE '%[^0-9]%'),   -- digits only (UC-64.0.E2)
    CONSTRAINT [CK_Staff_Resigned]   CHECK ([employmentStatus] <> 'resigned' OR [resignationDate] IS NOT NULL)
);
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Staff_IdCard] ON [dbo].[Staff]([idCard]) WHERE [idCard] IS NOT NULL;
GO

-- [OLD] Counters = checkout counters (POS terminals)
CREATE TABLE [dbo].[Counters] (
    [id]          BIGINT IDENTITY(1,1) NOT NULL,
    [counterCode] VARCHAR(50)   NOT NULL,
    [counterName] NVARCHAR(100) NOT NULL,
    [status]      VARCHAR(20)   NOT NULL CONSTRAINT [DF_Counters_Status] DEFAULT ('ACTIVE'),
    CONSTRAINT [PK_Counters]            PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Counters_Code]       UNIQUE ([counterCode]),
    CONSTRAINT [CK_Counters_Status]     CHECK ([status] IN ('ACTIVE', 'INACTIVE'))
);
GO

-- [OLD] Shifts. BR-76: endTime > startTime. BR-78: name/time immutable (enforced in the app).
CREATE TABLE [dbo].[Shifts] (
    [id]               INT IDENTITY(1,1) NOT NULL,
    [name]             NVARCHAR(50) NOT NULL,
    [startTime]        TIME(7)      NOT NULL,
    [endTime]          TIME(7)      NOT NULL,
    [checkInStart]     TIME(7)      NULL,
    [checkInEnd]       TIME(7)      NULL,
    [checkOutDeadline] TIME(7)      NULL,
    [isActive]         BIT          NOT NULL CONSTRAINT [DF_Shifts_IsActive] DEFAULT (1),
    CONSTRAINT [PK_Shifts]      PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CK_Shift_Time]  CHECK ([endTime] > [startTime])
);
GO

-- [OLD+] WorkSchedules = shift assignment + attendance (UC-73/74/80/81).
--        Matches the legacy "latest migration" (counterId and snapshot columns removed,
--        attendanceRecord / penaltyAmount added). openingCash is new (UC-73: cashier
--        declares starting cash at check-in, before any handover row exists).
CREATE TABLE [dbo].[WorkSchedules] (
    [id]               INT IDENTITY(1,1) NOT NULL,
    [staffId]          BIGINT        NOT NULL,
    [shiftId]          INT           NOT NULL,
    [workDate]         DATE          NOT NULL,
    [checkInTime]      DATETIME2(7)  NULL,
    [checkOutTime]     DATETIME2(7)  NULL,
    [workedHours]      FLOAT         NOT NULL CONSTRAINT [DF_Schedule_WorkedHours] DEFAULT (0),
    [status]           VARCHAR(20)   NOT NULL CONSTRAINT [DF_Schedule_Status] DEFAULT ('assigned'),
    [note]             NVARCHAR(MAX) NULL,
    [attendanceRecord] VARCHAR(50)   NULL     CONSTRAINT [DF_Schedule_Attendance] DEFAULT ('OnTime'),
    [penaltyAmount]    DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Schedule_Penalty] DEFAULT (0),
    [openingCash]      DECIMAL(15,2) NULL,
    CONSTRAINT [PK_WorkSchedules]   PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Staff_Schedule]  UNIQUE ([staffId], [shiftId], [workDate]),
    CONSTRAINT [FK_Schedule_Staff]  FOREIGN KEY ([staffId]) REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [FK_Schedule_Shift]  FOREIGN KEY ([shiftId]) REFERENCES [dbo].[Shifts]([id]),
    CONSTRAINT [CK_Schedule_Status] CHECK ([status] IN ('assigned', 'working', 'completed', 'absent', 'late')),
    CONSTRAINT [CK_Schedule_Hours]  CHECK ([workedHours] >= 0 AND [penaltyAmount] >= 0),
    CONSTRAINT [CK_Schedule_InOut]  CHECK ([checkOutTime] IS NULL OR [checkInTime] IS NULL OR [checkOutTime] >= [checkInTime])
);
GO
CREATE NONCLUSTERED INDEX [IX_WorkSchedules_WorkDate] ON [dbo].[WorkSchedules]([workDate], [staffId]);
GO

-- [OLD+] CashHandovers (UC-82/83, BR-08..BR-11).
--        difference = actual - (opening + system) exactly as in the legacy DB.
--        New: BR-10 note required when there is a variance, and the manager review
--        fields used by UC-20 / BR-11.
CREATE TABLE [dbo].[CashHandovers] (
    [id]           INT IDENTITY(1,1) NOT NULL,
    [scheduleId]   INT           NOT NULL,
    [handoverTime] DATETIME2(7)  NOT NULL CONSTRAINT [DF_Handover_Time]    DEFAULT (SYSDATETIME()),
    [openingCash]  DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Handover_Opening] DEFAULT (0),
    [systemCash]   DECIMAL(15,2) NOT NULL,
    [actualCash]   DECIMAL(15,2) NOT NULL,
    [difference]   AS ([actualCash] - ([openingCash] + [systemCash])) PERSISTED,
    [note]         NVARCHAR(MAX) NULL,
    [reviewStatus] VARCHAR(20)   NOT NULL CONSTRAINT [DF_Handover_Review] DEFAULT ('Pending'),
    [reviewedBy]   BIGINT        NULL,
    [reviewedAt]   DATETIME2(7)  NULL,
    [reviewNote]   NVARCHAR(500) NULL,
    CONSTRAINT [PK_CashHandovers]        PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Handover_Schedule]    UNIQUE ([scheduleId]),
    CONSTRAINT [FK_Handover_Schedule]    FOREIGN KEY ([scheduleId])  REFERENCES [dbo].[WorkSchedules]([id]),
    CONSTRAINT [FK_Handover_ReviewedBy]  FOREIGN KEY ([reviewedBy])  REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_Handover_Review]      CHECK ([reviewStatus] IN ('Pending', 'Reviewed')),
    CONSTRAINT [CK_Handover_Amounts]     CHECK ([openingCash] >= 0 AND [systemCash] >= 0 AND [actualCash] >= 0),
    CONSTRAINT [CK_Handover_NoteOnDiff]  CHECK ([actualCash] = [openingCash] + [systemCash] OR [note] IS NOT NULL)
);
GO

-- [OLD] Payrolls = salary report rows (UC-68). Calculated from actual check-in/out (BR-71).
CREATE TABLE [dbo].[Payrolls] (
    [id]                INT IDENTITY(1,1) NOT NULL,
    [staffId]           BIGINT        NOT NULL,
    [month]             INT           NOT NULL,
    [year]              INT           NOT NULL,
    [appliedBaseSalary] DECIMAL(15,2) NOT NULL,
    [appliedSalaryType] VARCHAR(20)   NOT NULL,
    [totalWorkUnit]     FLOAT         NOT NULL,
    [provisionalSalary] DECIMAL(15,2) NULL,
    [deductions]        DECIMAL(15,2) NULL CONSTRAINT [DF_Payroll_Deductions] DEFAULT (0),
    [finalAmount]       DECIMAL(15,2) NULL,
    [note]              NVARCHAR(MAX) NULL,
    [status]            VARCHAR(20)   NULL CONSTRAINT [DF_Payroll_Status]    DEFAULT ('draft'),
    [createdAt]         DATETIME2(7)  NULL CONSTRAINT [DF_Payroll_CreatedAt] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Payrolls]       PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Payroll_Period] UNIQUE ([staffId], [month], [year]),
    CONSTRAINT [FK_Payroll_Staff]  FOREIGN KEY ([staffId]) REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_Payroll_Status] CHECK ([status] IN ('draft', 'paid')),
    CONSTRAINT [CK_Payroll_Month]  CHECK ([month] BETWEEN 1 AND 12)
);
GO

/* =====================================================================
   2. CUSTOMERS                                       (FE-06)
   ===================================================================== */

-- [OLD+] Customers. BR-23: phone is the unique customer key, so it is now NOT NULL
--        (legacy allowed NULL). Walk-in buyers use Invoices.customerId = NULL.
CREATE TABLE [dbo].[Customers] (
    [id]            BIGINT IDENTITY(1,1) NOT NULL,
    [phone]         VARCHAR(15)   NOT NULL,
    [name]          NVARCHAR(100) NULL,
    [loyaltyPoints] INT           NOT NULL CONSTRAINT [DF_Customers_Points]   DEFAULT (0),
    [totalSpending] DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Customers_Spending] DEFAULT (0),
    [status]        VARCHAR(20)   NOT NULL CONSTRAINT [DF_Customers_Status]   DEFAULT ('Active'),
    [createdAt]     DATETIME2(7)  NOT NULL CONSTRAINT [DF_Customers_Created]  DEFAULT (SYSDATETIME()),
    [updatedAt]     DATETIME2(7)  NOT NULL CONSTRAINT [DF_Customers_Updated]  DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Customers]       PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Customers_Phone] UNIQUE ([phone]),
    CONSTRAINT [CK_Customer_Status] CHECK ([status] IN ('Active', 'Inactive', 'Blocked')),
    CONSTRAINT [CK_Customer_Points] CHECK ([loyaltyPoints] >= 0 AND [totalSpending] >= 0)
);
GO

/* =====================================================================
   3. PRODUCT CATALOG                                 (FE-02)
   ===================================================================== */

-- [OLD] Categories (self-referencing tree, UC-38..41)
CREATE TABLE [dbo].[Categories] (
    [id]       INT IDENTITY(1,1) NOT NULL,
    [name]     NVARCHAR(100) NOT NULL,
    [parentId] INT           NULL,
    [status]   BIT           NOT NULL CONSTRAINT [DF_Categories_Status] DEFAULT (1),
    [imageUrl] NVARCHAR(500) NULL,
    CONSTRAINT [PK_Categories]     PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_Category_Parent] FOREIGN KEY ([parentId]) REFERENCES [dbo].[Categories]([id])
);
GO

-- [OLD] Products. BR-57: code unique. BR-59: soft delete via status (never DELETE a sold product).
--       isCombo stays on Products (the SRS diagram draws it on ProductVariant; see notes).
CREATE TABLE [dbo].[Products] (
    [id]                   BIGINT IDENTITY(1,1) NOT NULL,
    [code]                 VARCHAR(50)   NOT NULL,
    [name]                 NVARCHAR(200) NOT NULL,
    [categoryId]           INT           NULL,
    [baseUnit]             NVARCHAR(20)  NOT NULL,
    [allowDecimalQuantity] BIT           NOT NULL CONSTRAINT [DF_Products_AllowDec] DEFAULT (0),
    [isCombo]              BIT           NOT NULL CONSTRAINT [DF_Products_IsCombo]  DEFAULT (0),
    [status]               VARCHAR(20)   NOT NULL CONSTRAINT [DF_Products_Status]   DEFAULT ('Selling'),
    [createdAt]            DATETIME2(7)  NOT NULL CONSTRAINT [DF_Products_Created]  DEFAULT (SYSDATETIME()),
    [updatedAt]            DATETIME2(7)  NOT NULL CONSTRAINT [DF_Products_Updated]  DEFAULT (SYSDATETIME()),
    [imageUrl]             NVARCHAR(500) NULL,
    CONSTRAINT [PK_Products]        PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Products_Code]   UNIQUE ([code]),
    CONSTRAINT [FK_Product_Category] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[Categories]([id]),
    CONSTRAINT [CK_Product_Status]  CHECK ([status] IN ('Selling', 'StopSelling', 'Suspended'))
);
GO
CREATE NONCLUSTERED INDEX [IX_Products_Category] ON [dbo].[Products]([categoryId], [status]);
GO

-- [REN] ProductUnits -> ProductVariants. One row per selling unit (piece / pack / case).
--       conversionFactor = how many base units one variant contains (UC-51).
--       Stock, batches, supplier prices, PO lines and invoice lines all hang on the variant.
--       BR-57: barcode unique (filtered, barcode may be NULL).
CREATE TABLE [dbo].[ProductVariants] (
    [id]               INT IDENTITY(1,1) NOT NULL,
    [productId]        BIGINT        NOT NULL,
    [unitName]         NVARCHAR(20)  NOT NULL,
    [conversionFactor] INT           NOT NULL,
    [salePrice]        DECIMAL(15,2) NOT NULL,
    [barcode]          VARCHAR(50)   NULL,
    [unitType]         VARCHAR(20)   NOT NULL CONSTRAINT [DF_Variant_UnitType] DEFAULT ('PIECE'),
    CONSTRAINT [PK_ProductVariants]  PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Variant_Unit]     UNIQUE ([productId], [unitName]),
    CONSTRAINT [UQ_Variant_ProdId]   UNIQUE ([productId], [id]),   -- target of the composite FK in PromotionProducts
    CONSTRAINT [FK_Variant_Product]  FOREIGN KEY ([productId]) REFERENCES [dbo].[Products]([id]) ON DELETE CASCADE,
    CONSTRAINT [CK_Variant_Type]     CHECK ([unitType] IN ('PIECE', 'WEIGHT')),
    CONSTRAINT [CK_Variant_Factor]   CHECK ([conversionFactor] > 0),
    CONSTRAINT [CK_Variant_Price]    CHECK ([salePrice] >= 0)
);
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Variants_Barcode] ON [dbo].[ProductVariants]([barcode]) WHERE [barcode] IS NOT NULL;
GO

-- [OLD+] ProductSalePriceHistories (UC-50, BR-64). productUnitId -> variantId.
CREATE TABLE [dbo].[ProductSalePriceHistories] (
    [id]           INT IDENTITY(1,1) NOT NULL,
    [productId]    BIGINT        NOT NULL,
    [variantId]    INT           NOT NULL,
    [oldSalePrice] DECIMAL(15,2) NULL,
    [newSalePrice] DECIMAL(15,2) NULL,
    [changedBy]    BIGINT        NOT NULL,
    [changedAt]    DATETIME2(7)  NOT NULL CONSTRAINT [DF_PSPH_ChangedAt] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_ProductSalePriceHistories] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_PSPH_Product] FOREIGN KEY ([productId]) REFERENCES [dbo].[Products]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_PSPH_Variant] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [FK_PSPH_Staff]   FOREIGN KEY ([changedBy]) REFERENCES [dbo].[Staff]([id])
);
GO
CREATE NONCLUSTERED INDEX [IX_PSPH_Variant] ON [dbo].[ProductSalePriceHistories]([variantId], [changedAt] DESC);
GO

-- [OLD+] ProductCombos (UC-45). The combo is a Product with isCombo = 1 (it has its own
--        sellable variant). Components are variants, because stock is per variant (BR-60).
CREATE TABLE [dbo].[ProductCombos] (
    [id]               INT IDENTITY(1,1) NOT NULL,
    [parentProductId]  BIGINT NOT NULL,
    [childVariantId]   INT    NOT NULL,
    [quantity]         INT    NOT NULL CONSTRAINT [DF_Combo_Quantity] DEFAULT (1),
    CONSTRAINT [PK_ProductCombos]  PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Combo_Child]    UNIQUE ([parentProductId], [childVariantId]),
    CONSTRAINT [FK_Combo_Parent]   FOREIGN KEY ([parentProductId]) REFERENCES [dbo].[Products]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_Combo_Child]    FOREIGN KEY ([childVariantId])  REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [CK_Combo_Quantity] CHECK ([quantity] > 0)
);
GO

-- [OLD] LabelPrintQueue (barcode label printing, UC-44)
CREATE TABLE [dbo].[LabelPrintQueue] (
    [id]        INT IDENTITY(1,1) NOT NULL,
    [productId] BIGINT       NOT NULL,
    [barcode]   VARCHAR(50)  NOT NULL,
    [quantity]  INT          NOT NULL CONSTRAINT [DF_Queue_Quantity] DEFAULT (1),
    [status]    VARCHAR(20)  NOT NULL CONSTRAINT [DF_Queue_Status]   DEFAULT ('Pending'),
    [createdAt] DATETIME2(7) NOT NULL CONSTRAINT [DF_Queue_Created]  DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_LabelPrintQueue] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_Queue_Product]   FOREIGN KEY ([productId]) REFERENCES [dbo].[Products]([id]) ON DELETE CASCADE,
    CONSTRAINT [CK_Queue_Status]    CHECK ([status] IN ('Pending', 'Printed', 'Cancelled')),
    CONSTRAINT [CK_Queue_Quantity]  CHECK ([quantity] > 0)
);
GO

/* =====================================================================
   4. INVENTORY                                       (FE-03)
   ===================================================================== */

-- [OLD+] InventoryStocks. Legacy key was productId; now one row per variant (BR-61).
--        quantityOnHand is the total over all batches. Sellable stock excludes batches
--        that are EXPIRED / DAMAGED / RETURNED / DISPOSED (BR-55) - computed from Batches.
--        minThreshold: UC-30, BR-41, BR-52.
CREATE TABLE [dbo].[InventoryStocks] (
    [variantId]      INT           NOT NULL,
    [quantityOnHand] DECIMAL(15,3) NOT NULL CONSTRAINT [DF_Stock_OnHand]    DEFAULT (0),
    [minThreshold]   DECIMAL(15,3) NOT NULL CONSTRAINT [DF_Stock_Threshold] DEFAULT (0),
    CONSTRAINT [PK_InventoryStocks]   PRIMARY KEY CLUSTERED ([variantId]),
    CONSTRAINT [FK_Stock_Variant]     FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [CK_Stock_NonNegative] CHECK ([quantityOnHand] >= 0 AND [minThreshold] >= 0)
);
GO

/* =====================================================================
   5. PROCUREMENT                                     (FE-04)
   ===================================================================== */

-- [OLD+] Suppliers. New: taxId / phoneNumber unique (BR-83, UC-85), returnPolicy (UC-87,
--        BR-62), status (UC-88, BR-63, BR-85).
CREATE TABLE [dbo].[Suppliers] (
    [id]           INT IDENTITY(1,1) NOT NULL,
    [name]         NVARCHAR(255) NOT NULL,
    [taxId]        VARCHAR(20)   NOT NULL,
    [phoneNumber]  VARCHAR(20)   NOT NULL,
    [contactInfo]  NVARCHAR(255) NULL,
    [address]      NVARCHAR(255) NULL,
    [returnPolicy] VARCHAR(20)   NOT NULL CONSTRAINT [DF_Supplier_Policy] DEFAULT ('NonReturnable'),
    [status]       VARCHAR(20)   NOT NULL CONSTRAINT [DF_Supplier_Status] DEFAULT ('Active'),
    [createdAt]    DATETIME2(7)  NOT NULL CONSTRAINT [DF_Supplier_Created] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Suppliers]        PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Suppliers_TaxId]  UNIQUE ([taxId]),
    CONSTRAINT [UQ_Suppliers_Phone]  UNIQUE ([phoneNumber]),
    CONSTRAINT [CK_Supplier_Policy]  CHECK ([returnPolicy] IN ('Returnable', 'NonReturnable')),
    CONSTRAINT [CK_Supplier_Status]  CHECK ([status] IN ('Active', 'Inactive'))
);
GO

-- [OLD] ProductSuppliers = which products a supplier provides (UC-84, UC-22 catalog)
CREATE TABLE [dbo].[ProductSuppliers] (
    [productId]  BIGINT      NOT NULL,
    [supplierId] INT         NOT NULL,
    [status]     VARCHAR(20) NOT NULL CONSTRAINT [DF_PS_Status] DEFAULT ('ACTIVE'),
    CONSTRAINT [PK_ProductSuppliers] PRIMARY KEY CLUSTERED ([productId], [supplierId]),
    CONSTRAINT [FK_PS_Product]  FOREIGN KEY ([productId])  REFERENCES [dbo].[Products]([id]),
    CONSTRAINT [FK_PS_Supplier] FOREIGN KEY ([supplierId]) REFERENCES [dbo].[Suppliers]([id]),
    CONSTRAINT [CK_PS_Status]   CHECK ([status] IN ('ACTIVE', 'INACTIVE'))
);
GO

-- [OLD+] SupplierProductPrices = supply price history per supplier + variant (UC-84).
--        The latest row (createdAt, id) is the current price. BR-81: price > 0.
--        Old rows are never updated, so existing POs keep the price they were created with.
--        Legacy productId column dropped (derivable from the variant); unitId -> variantId, NOT NULL.
CREATE TABLE [dbo].[SupplierProductPrices] (
    [id]         INT IDENTITY(1,1) NOT NULL,
    [supplierId] INT           NOT NULL,
    [variantId]  INT           NOT NULL,
    [price]      DECIMAL(15,2) NOT NULL,
    [createdAt]  DATETIME2(7)  NOT NULL CONSTRAINT [DF_SPP_Created] DEFAULT (SYSDATETIME()),
    [createdBy]  BIGINT        NULL,
    CONSTRAINT [PK_SupplierProductPrices] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_SPP_Supplier] FOREIGN KEY ([supplierId]) REFERENCES [dbo].[Suppliers]([id]),
    CONSTRAINT [FK_SPP_Variant]  FOREIGN KEY ([variantId])  REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [FK_SPP_Staff]    FOREIGN KEY ([createdBy])  REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_SPP_Price]    CHECK ([price] > 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_SPP_SupplierVariant] ON [dbo].[SupplierProductPrices]([supplierId], [variantId], [createdAt] DESC, [id] DESC);
GO

-- [OLD+] PurchaseOrders (UC-22..26).
--   Status machine (SRS UC-23): PENDING -> APPROVED -> RECEIVED ; PENDING|APPROVED -> CANCELED
--   (legacy had Draft/Rejected/WaitingForDelivery/PartiallyReceived/CannotDeliver; not in the SRS).
--   poCode is derived from id, so the "unique PO ID" (UC-22 step 8) needs no app code.
--   processBy (legacy approver) is split into approvedBy/approvedAt and canceledBy/canceledAt/cancelReason
--   because UC-25 and UC-26 record them separately. receivedBy moved to GoodReceipts.
CREATE TABLE [dbo].[PurchaseOrders] (
    [id]          INT IDENTITY(1,1) NOT NULL,
    [poCode]      AS (CONVERT(VARCHAR(20), 'PO-' + RIGHT('000000' + CONVERT(VARCHAR(10), [id]), 6))) PERSISTED,
    [supplierId]  INT           NOT NULL,
    -- BR-84: supplier data copied at creation, so editing the supplier later never rewrites old POs
    [supplierName]    NVARCHAR(255) NOT NULL,
    [supplierTaxId]   VARCHAR(20)   NOT NULL,
    [supplierPhone]   VARCHAR(20)   NOT NULL,
    [supplierAddress] NVARCHAR(255) NULL,
    [status]      VARCHAR(20)   NOT NULL CONSTRAINT [DF_PO_Status]  DEFAULT ('PENDING'),
    [totalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [DF_PO_Total]   DEFAULT (0),
    [note]        NVARCHAR(MAX) NULL,
    [createdBy]   BIGINT        NOT NULL,
    [createdAt]   DATETIME2(7)  NOT NULL CONSTRAINT [DF_PO_Created] DEFAULT (SYSDATETIME()),
    [approvedBy]  BIGINT        NULL,
    [approvedAt]  DATETIME2(7)  NULL,
    [canceledBy]  BIGINT        NULL,
    [canceledAt]  DATETIME2(7)  NULL,
    [cancelReason] NVARCHAR(500) NULL,
    CONSTRAINT [PK_PurchaseOrders]   PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_PO_Code]          UNIQUE ([poCode]),
    CONSTRAINT [FK_PO_Supplier]      FOREIGN KEY ([supplierId]) REFERENCES [dbo].[Suppliers]([id]),
    CONSTRAINT [FK_PO_CreatedBy]     FOREIGN KEY ([createdBy])  REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [FK_PO_ApprovedBy]    FOREIGN KEY ([approvedBy]) REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [FK_PO_CanceledBy]    FOREIGN KEY ([canceledBy]) REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_PO_Status]        CHECK ([status] IN ('PENDING', 'APPROVED', 'RECEIVED', 'CANCELED')),
    CONSTRAINT [CK_PO_Total]         CHECK ([totalAmount] >= 0),
    -- UC-25 POST-2: approver + time are recorded
    CONSTRAINT [CK_PO_ApprovalInfo]  CHECK ([status] NOT IN ('APPROVED', 'RECEIVED') OR ([approvedBy] IS NOT NULL AND [approvedAt] IS NOT NULL)),
    -- UC-26 POST-2 / E2: cancellation needs reason, manager and timestamp
    CONSTRAINT [CK_PO_CancelInfo]    CHECK ([status] <> 'CANCELED' OR ([canceledBy] IS NOT NULL AND [canceledAt] IS NOT NULL AND [cancelReason] IS NOT NULL))
);
GO
CREATE NONCLUSTERED INDEX [IX_PO_StatusCreated] ON [dbo].[PurchaseOrders]([status], [createdAt] DESC, [id] DESC);
CREATE NONCLUSTERED INDEX [IX_PO_Supplier]      ON [dbo].[PurchaseOrders]([supplierId]);
GO

-- [OLD+] PurchaseOrderItems. productUnitId -> variantId. BR-81: costPrice > 0, quantity > 0.
--        One line per variant per PO. total / receivedTotal computed as in the legacy DB.
CREATE TABLE [dbo].[PurchaseOrderItems] (
    [id]               INT IDENTITY(1,1) NOT NULL,
    [poId]             INT           NOT NULL,
    [variantId]        INT           NOT NULL,
    [quantity]         DECIMAL(15,3) NOT NULL,
    [costPrice]        DECIMAL(15,2) NOT NULL,
    [note]             NVARCHAR(500) NULL,
    [receivedQuantity] DECIMAL(15,3) NOT NULL CONSTRAINT [DF_POI_Received] DEFAULT (0),
    [receivedTotal]    AS ([receivedQuantity] * [costPrice]) PERSISTED,
    [total]            AS ([quantity] * [costPrice]) PERSISTED,
    CONSTRAINT [PK_PurchaseOrderItems] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_POI_PoVariant]      UNIQUE ([poId], [variantId]),
    CONSTRAINT [FK_POI_PO]      FOREIGN KEY ([poId])      REFERENCES [dbo].[PurchaseOrders]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_POI_Variant] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [CK_POI_Quantity] CHECK ([quantity] > 0),
    CONSTRAINT [CK_POI_Cost]     CHECK ([costPrice] > 0),
    CONSTRAINT [CK_POI_Received] CHECK ([receivedQuantity] >= 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_POI_Variant] ON [dbo].[PurchaseOrderItems]([variantId]);
GO

-- [NEW] GoodReceipts (UC-31/32). One receipt confirms one APPROVED PO (BR-45: stock rises only at RECEIVED).
CREATE TABLE [dbo].[GoodReceipts] (
    [id]            INT IDENTITY(1,1) NOT NULL,
    [receiptCode]   AS (CONVERT(VARCHAR(20), 'GR-' + RIGHT('000000' + CONVERT(VARCHAR(10), [id]), 6))) PERSISTED,
    [poId]          INT           NOT NULL,
    [receivedBy]    BIGINT        NOT NULL,
    [receivedAt]    DATETIME2(7)  NOT NULL CONSTRAINT [DF_GR_ReceivedAt] DEFAULT (SYSDATETIME()),
    [totalQuantity] DECIMAL(15,3) NOT NULL CONSTRAINT [DF_GR_Qty]   DEFAULT (0),
    [totalValue]    DECIMAL(18,2) NOT NULL CONSTRAINT [DF_GR_Value] DEFAULT (0),
    [note]          NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_GoodReceipts]  PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_GR_Code]       UNIQUE ([receiptCode]),
    CONSTRAINT [UQ_GR_Po]         UNIQUE ([poId]),
    CONSTRAINT [FK_GR_PO]         FOREIGN KEY ([poId])       REFERENCES [dbo].[PurchaseOrders]([id]),
    CONSTRAINT [FK_GR_ReceivedBy] FOREIGN KEY ([receivedBy]) REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_GR_Totals]     CHECK ([totalQuantity] >= 0 AND [totalValue] >= 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_GR_ReceivedAt] ON [dbo].[GoodReceipts]([receivedAt]);
GO

-- [NEW] GoodReceiptItems: what was actually received per PO line (BR-44: may be < ordered)
CREATE TABLE [dbo].[GoodReceiptItems] (
    [id]               INT IDENTITY(1,1) NOT NULL,
    [receiptId]        INT           NOT NULL,
    [poItemId]         INT           NOT NULL,
    [receivedQuantity] DECIMAL(15,3) NOT NULL,
    [unitCost]         DECIMAL(15,2) NOT NULL,
    [receivedTotal]    AS ([receivedQuantity] * [unitCost]) PERSISTED,
    [note]             NVARCHAR(500) NULL,
    CONSTRAINT [PK_GoodReceiptItems] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_GRI_Item]  UNIQUE ([receiptId], [poItemId]),
    CONSTRAINT [UQ_GRI_POItem] UNIQUE ([poItemId]),
    CONSTRAINT [FK_GRI_Receipt] FOREIGN KEY ([receiptId]) REFERENCES [dbo].[GoodReceipts]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_GRI_POItem]  FOREIGN KEY ([poItemId])  REFERENCES [dbo].[PurchaseOrderItems]([id]),
    CONSTRAINT [CK_GRI_Amounts] CHECK ([receivedQuantity] >= 0 AND [unitCost] >= 0)
);
GO

-- [NEW] Batches (UC-35/36/37, BR-53..56). Created by a goods receipt line.
--       status ACTIVE | EXPIRED | DAMAGED | RETURNED | DISPOSED.
--       FEFO = ORDER BY expirationDate among ACTIVE batches with quantity > 0.
CREATE TABLE [dbo].[Batches] (
    [id]                 BIGINT IDENTITY(1,1) NOT NULL,
    [batchCode]          VARCHAR(50)   NOT NULL,
    [variantId]          INT           NOT NULL,
    [supplierId]         INT           NULL,
    [goodReceiptItemId]  INT           NULL,
    [manufactureDate]    DATE          NULL,
    [expirationDate]     DATE          NULL,
    [initialQuantity]    DECIMAL(15,3) NOT NULL,
    [quantity]           DECIMAL(15,3) NOT NULL,
    [status]             VARCHAR(20)   NOT NULL CONSTRAINT [DF_Batch_Status]  DEFAULT ('ACTIVE'),
    [createdAt]          DATETIME2(7)  NOT NULL CONSTRAINT [DF_Batch_Created] DEFAULT (SYSDATETIME()),
    [updatedAt]          DATETIME2(7)  NOT NULL CONSTRAINT [DF_Batch_Updated] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Batches]        PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Batch_Code]     UNIQUE ([variantId], [batchCode]),
    CONSTRAINT [FK_Batch_Variant]  FOREIGN KEY ([variantId])         REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [FK_Batch_Supplier] FOREIGN KEY ([supplierId])        REFERENCES [dbo].[Suppliers]([id]),
    CONSTRAINT [FK_Batch_GRItem]   FOREIGN KEY ([goodReceiptItemId]) REFERENCES [dbo].[GoodReceiptItems]([id]),
    CONSTRAINT [CK_Batch_Status]   CHECK ([status] IN ('ACTIVE', 'EXPIRED', 'DAMAGED', 'RETURNED', 'DISPOSED')),
    CONSTRAINT [CK_Batch_Quantity] CHECK ([quantity] >= 0 AND [initialQuantity] >= 0),
    -- BR-54
    CONSTRAINT [CK_Batch_Dates]    CHECK ([manufactureDate] IS NULL OR [expirationDate] IS NULL OR [expirationDate] > [manufactureDate])
);
GO
CREATE NONCLUSTERED INDEX [IX_Batch_Fefo]   ON [dbo].[Batches]([variantId], [status], [expirationDate]) INCLUDE ([quantity]);
CREATE NONCLUSTERED INDEX [IX_Batch_Expiry] ON [dbo].[Batches]([expirationDate]) WHERE [status] = 'ACTIVE';
GO

-- [OLD+] InventoryAdjustments = stock adjustment request (UC-27/28/29, BR-39, BR-50, BR-51).
--        New: reviewNote (rejection reason must be logged). reason widened to 255.
CREATE TABLE [dbo].[InventoryAdjustments] (
    [id]          INT IDENTITY(1,1) NOT NULL,
    [createdBy]   BIGINT        NOT NULL,
    [reason]      NVARCHAR(255) NOT NULL,
    [status]      VARCHAR(20)   NOT NULL CONSTRAINT [DF_Adj_Status]  DEFAULT ('PENDING'),
    [createdAt]   DATETIME2(7)  NOT NULL CONSTRAINT [DF_Adj_Created] DEFAULT (SYSDATETIME()),
    [processedBy] BIGINT        NULL,
    [processedAt] DATETIME2(7)  NULL,
    [reviewNote]  NVARCHAR(500) NULL,
    CONSTRAINT [PK_InventoryAdjustments] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_Adjustment_Staff]       FOREIGN KEY ([createdBy])   REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [FK_Adjustment_ProcessedBy] FOREIGN KEY ([processedBy]) REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_Adjustment_Status] CHECK ([status] IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT [CK_Adjustment_Processed] CHECK ([status] = 'PENDING' OR ([processedBy] IS NOT NULL AND [processedAt] IS NOT NULL)),
    CONSTRAINT [CK_Adjustment_RejectNote] CHECK (
        [status] <> 'REJECTED'
        OR NULLIF(LTRIM(RTRIM([reviewNote])), '') IS NOT NULL
    )
);
GO

-- [OLD+] InventoryAdjustmentItems. productId -> variantId, optional batchId (BR-51),
--        variance = actual - system (BR-49) as a computed column.
CREATE TABLE [dbo].[InventoryAdjustmentItems] (
    [id]             INT IDENTITY(1,1) NOT NULL,
    [adjustmentId]   INT           NOT NULL,
    [variantId]      INT           NOT NULL,
    [batchId]        BIGINT        NULL,
    [systemQuantity] DECIMAL(15,3) NOT NULL,
    [actualQuantity] DECIMAL(15,3) NOT NULL,
    [variance]       AS ([actualQuantity] - [systemQuantity]) PERSISTED,
    CONSTRAINT [PK_InventoryAdjustmentItems] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_IAI_Adjustment] FOREIGN KEY ([adjustmentId]) REFERENCES [dbo].[InventoryAdjustments]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_IAI_Variant]    FOREIGN KEY ([variantId])    REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [FK_IAI_Batch]      FOREIGN KEY ([batchId])      REFERENCES [dbo].[Batches]([id]),
    CONSTRAINT [CK_IAI_Quantity]   CHECK ([systemQuantity] >= 0 AND [actualQuantity] >= 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_IAI_Adjustment] ON [dbo].[InventoryAdjustmentItems]([adjustmentId]);
GO

-- [OLD+] ProblematicGoodsReport (UC-33, BR-44, BR-46, BR-47). Table name kept singular as in the legacy DB.
--        New: links to the receipt / batch / variant, quantity, evidence and the manager's decision.
CREATE TABLE [dbo].[ProblematicGoodsReport] (
    [id]               INT IDENTITY(1,1) NOT NULL,
    [title]            NVARCHAR(255) NOT NULL,
    [issueDescription] NVARCHAR(MAX) NULL,
    [reportedBy]       BIGINT        NOT NULL,
    [goodReceiptId]    INT           NULL,
    [batchId]          BIGINT        NULL,
    [variantId]        INT           NOT NULL,
    [quantity]         DECIMAL(15,3) NOT NULL,
    [evidenceUrl]      NVARCHAR(500) NULL,
    [status]           VARCHAR(20)   NOT NULL CONSTRAINT [DF_PGR_Status]  DEFAULT ('Open'),
    [resolution]       VARCHAR(30)   NULL,
    [resolvedBy]       BIGINT        NULL,
    [resolvedAt]       DATETIME2(7)  NULL,
    [createdAt]        DATETIME2(7)  NOT NULL CONSTRAINT [DF_PGR_Created] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_ProblematicGoodsReport] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_PGR_Staff]      FOREIGN KEY ([reportedBy])    REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [FK_PGR_Receipt]    FOREIGN KEY ([goodReceiptId]) REFERENCES [dbo].[GoodReceipts]([id]),
    CONSTRAINT [FK_PGR_Batch]      FOREIGN KEY ([batchId])       REFERENCES [dbo].[Batches]([id]),
    CONSTRAINT [FK_PGR_Variant]    FOREIGN KEY ([variantId])     REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [FK_PGR_ResolvedBy] FOREIGN KEY ([resolvedBy])    REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_PGR_Status]     CHECK ([status] IN ('Open', 'Resolved', 'Rejected')),
    CONSTRAINT [CK_PGR_Resolution] CHECK ([resolution] IS NULL OR [resolution] IN ('RETURN_TO_SUPPLIER', 'DISPOSE', 'NO_ACTION')),
    CONSTRAINT [CK_PGR_Quantity]   CHECK ([quantity] > 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_PGR_CreatedAt] ON [dbo].[ProblematicGoodsReport]([createdAt] DESC, [id] DESC);
GO

-- [NEW] SupplierReturns (UC-34, BR-48, BR-62). The return receipt; whole batches only.
--       Only for suppliers with returnPolicy = 'Returnable' (checked in the app).
--       totalDebtAdjustment = amount deducted from what the store owes the supplier.
CREATE TABLE [dbo].[SupplierReturns] (
    [id]                  INT IDENTITY(1,1) NOT NULL,
    [returnCode]          AS (CONVERT(VARCHAR(20), 'SR-' + RIGHT('000000' + CONVERT(VARCHAR(10), [id]), 6))) PERSISTED,
    [supplierId]          INT           NOT NULL,
    [createdBy]           BIGINT        NOT NULL,
    [createdAt]           DATETIME2(7)  NOT NULL CONSTRAINT [DF_SR_Created] DEFAULT (SYSDATETIME()),
    [reason]              NVARCHAR(500) NULL,
    [totalDebtAdjustment] DECIMAL(18,2) NOT NULL CONSTRAINT [DF_SR_Debt] DEFAULT (0),
    CONSTRAINT [PK_SupplierReturns] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_SR_Code]     UNIQUE ([returnCode]),
    CONSTRAINT [FK_SR_Supplier] FOREIGN KEY ([supplierId]) REFERENCES [dbo].[Suppliers]([id]),
    CONSTRAINT [FK_SR_Staff]    FOREIGN KEY ([createdBy])  REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_SR_Debt]     CHECK ([totalDebtAdjustment] >= 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_SR_Supplier] ON [dbo].[SupplierReturns]([supplierId], [createdAt] DESC);
GO

-- [NEW] SupplierReturnItems: one row per returned batch (the entire batch, no partial return).
CREATE TABLE [dbo].[SupplierReturnItems] (
    [id]               INT IDENTITY(1,1) NOT NULL,
    [supplierReturnId] INT           NOT NULL,
    [batchId]          BIGINT        NOT NULL,
    [quantity]         DECIMAL(15,3) NOT NULL,
    [unitCost]         DECIMAL(15,2) NOT NULL,
    [lineTotal]        AS ([quantity] * [unitCost]) PERSISTED,
    CONSTRAINT [PK_SupplierReturnItems] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_SRI_Batch]  UNIQUE ([batchId]),   -- a batch can be returned only once (BR-54/55)
    CONSTRAINT [FK_SRI_Return] FOREIGN KEY ([supplierReturnId]) REFERENCES [dbo].[SupplierReturns]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_SRI_Batch]  FOREIGN KEY ([batchId])          REFERENCES [dbo].[Batches]([id]),
    CONSTRAINT [CK_SRI_Amount] CHECK ([quantity] > 0 AND [unitCost] >= 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_SRI_Return] ON [dbo].[SupplierReturnItems]([supplierReturnId]);
GO

/* =====================================================================
   6. PROMOTIONS & VOUCHERS                           (FE-01)
   ===================================================================== */

-- [OLD+] Promotions (UC-52..56). SRS offers Percent / Amount only (legacy also had BuyXGetY).
--        New: minInvoiceValue and maxBudget (UC-53 step 4).
CREATE TABLE [dbo].[Promotions] (
    [id]              BIGINT IDENTITY(1,1) NOT NULL,
    [name]            NVARCHAR(255) NOT NULL,
    [type]            VARCHAR(20)   NOT NULL,
    [value]           DECIMAL(15,2) NOT NULL,
    [minInvoiceValue] DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Prom_MinInvoice] DEFAULT (0),
    [maxBudget]       DECIMAL(15,2) NULL,
    [startDate]       DATETIME2(7)  NOT NULL,
    [endDate]         DATETIME2(7)  NOT NULL,
    [status]          VARCHAR(20)   NOT NULL CONSTRAINT [DF_Prom_Status]  DEFAULT ('Active'),
    [createdAt]       DATETIME2(7)  NOT NULL CONSTRAINT [DF_Prom_Created] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Promotions]  PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CK_Prom_Type]   CHECK ([type] IN ('Percent', 'Amount')),
    -- Disabled = "Inactive" in the SRS; Deleted = soft delete (invoices keep referencing the row);
    -- "Upcoming" is derived: Active AND startDate > now.
    CONSTRAINT [CK_Prom_Status] CHECK ([status] IN ('Active', 'Disabled', 'Expired', 'Deleted')),
    CONSTRAINT [CK_Prom_Value]  CHECK ([value] > 0 AND ([type] <> 'Percent' OR [value] <= 100)),
    CONSTRAINT [CK_Prom_Dates]  CHECK ([endDate] > [startDate]),
    CONSTRAINT [CK_Prom_Budget] CHECK ([minInvoiceValue] >= 0 AND ([maxBudget] IS NULL OR [maxBudget] > 0))
);
GO

-- [OLD+] PromotionProducts (UC-54): a promotion targets a product or a whole category.
--        Optional variantId narrows it to one selling unit (legacy productUnitId).
CREATE TABLE [dbo].[PromotionProducts] (
    [id]          INT IDENTITY(1,1) NOT NULL,
    [promotionId] BIGINT NOT NULL,
    [productId]   BIGINT NULL,
    [categoryId]  INT    NULL,
    [variantId]   INT    NULL,
    CONSTRAINT [PK_PromotionProducts] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_PP_Promotion] FOREIGN KEY ([promotionId]) REFERENCES [dbo].[Promotions]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_PP_Product]   FOREIGN KEY ([productId])   REFERENCES [dbo].[Products]([id]),
    CONSTRAINT [FK_PP_Category]  FOREIGN KEY ([categoryId])  REFERENCES [dbo].[Categories]([id]),
    -- composite FK: when variantId is set it must belong to productId (not enforced while variantId is NULL)
    CONSTRAINT [FK_PP_Variant]   FOREIGN KEY ([productId], [variantId]) REFERENCES [dbo].[ProductVariants]([productId], [id]),
    -- exactly one target kind; variantId only together with a product
    CONSTRAINT [CK_PP_Target]    CHECK (([productId] IS NOT NULL AND [categoryId] IS NULL) OR ([productId] IS NULL AND [categoryId] IS NOT NULL)),
    CONSTRAINT [CK_PP_Variant]   CHECK ([variantId] IS NULL OR [productId] IS NOT NULL)
);
GO
CREATE NONCLUSTERED INDEX [IX_PP_Promotion] ON [dbo].[PromotionProducts]([promotionId]);
-- no duplicate links
CREATE UNIQUE NONCLUSTERED INDEX [UX_PP_Product]  ON [dbo].[PromotionProducts]([promotionId], [productId])              WHERE [productId] IS NOT NULL AND [variantId] IS NULL;
CREATE UNIQUE NONCLUSTERED INDEX [UX_PP_Variant]  ON [dbo].[PromotionProducts]([promotionId], [productId], [variantId]) WHERE [variantId] IS NOT NULL;
CREATE UNIQUE NONCLUSTERED INDEX [UX_PP_Category] ON [dbo].[PromotionProducts]([promotionId], [categoryId])             WHERE [categoryId] IS NOT NULL;
GO

-- [OLD+] Vouchers (UC-57..60). BR-66: unique code, BR-74: code immutable (app),
--        stored UPPERCASE (UC-58) - enforced with a binary-collation CHECK.
CREATE TABLE [dbo].[Vouchers] (
    [id]            INT IDENTITY(1,1) NOT NULL,
    [code]          VARCHAR(30)   NOT NULL,
    [value]         DECIMAL(15,2) NOT NULL,
    [type]          VARCHAR(20)   NOT NULL,
    [minOrderValue] DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Voucher_MinOrder] DEFAULT (0),
    [maxUsage]      INT           NOT NULL CONSTRAINT [DF_Voucher_MaxUsage] DEFAULT (100),
    [currentUsage]  INT           NOT NULL CONSTRAINT [DF_Voucher_Usage]    DEFAULT (0),
    [startDate]     DATETIME2(7)  NOT NULL,
    [expiryDate]    DATETIME2(7)  NOT NULL,
    [status]        VARCHAR(20)   NOT NULL CONSTRAINT [DF_Voucher_Status]  DEFAULT ('Active'),
    [createdAt]     DATETIME2(7)  NOT NULL CONSTRAINT [DF_Voucher_Created] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Vouchers]       PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Vouchers_Code]  UNIQUE ([code]),
    CONSTRAINT [CK_Voucher_Type]   CHECK ([type] IN ('Fixed', 'Percent')),
    CONSTRAINT [CK_Voucher_Status] CHECK ([status] IN ('Active', 'Disabled', 'Expired', 'Deleted')),   -- same meaning as Promotions
    CONSTRAINT [CK_Voucher_Value]  CHECK ([value] > 0 AND ([type] <> 'Percent' OR [value] <= 100)),
    CONSTRAINT [CK_Voucher_Usage]  CHECK ([maxUsage] > 0 AND [currentUsage] >= 0 AND [currentUsage] <= [maxUsage]),
    CONSTRAINT [CK_Voucher_Dates]  CHECK ([expiryDate] > [startDate]),
    CONSTRAINT [CK_Voucher_Upper]  CHECK ([code] COLLATE Latin1_General_BIN2 = UPPER([code]) COLLATE Latin1_General_BIN2)
);
GO

/* =====================================================================
   7. SALES                                           (FE-01)
   ===================================================================== */


-- [OLD+] Invoices (UC-01..20). BR-14: default UNPAID. BR-26: finalAmount >= 0.
--        BR-73: total discount <= 50% of totalAmount. New: scheduleId (UC-01 "cashier and shift"),
--        isOnHold / heldAt (UC-17; hold state is persisted centrally, BR-20).
CREATE TABLE [dbo].[Invoices] (
    [id]                BIGINT IDENTITY(1,1) NOT NULL,
    [invoiceCode]       VARCHAR(50)   NOT NULL,
    [staffId]           BIGINT        NOT NULL,
    [counterId]         BIGINT        NOT NULL,
    [scheduleId]        INT           NULL,
    [customerId]        BIGINT        NULL,
    [totalAmount]       DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Invoices_Total]    DEFAULT (0),
    [promotionId]       BIGINT        NULL,
    [promotionDiscount] DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Invoices_PromoDis] DEFAULT (0),
    [voucherDiscount]   DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Invoices_VoucDis]  DEFAULT (0),
    [usedPoints]        INT           NOT NULL CONSTRAINT [DF_Invoices_Points]   DEFAULT (0),
    [pointDiscount]     DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Invoices_PointDis] DEFAULT (0),
    [finalAmount]       DECIMAL(15,2) NOT NULL CONSTRAINT [DF_Invoices_Final]    DEFAULT (0),
    [status]            VARCHAR(20)   NOT NULL CONSTRAINT [DF_Invoices_Status]   DEFAULT ('UNPAID'),
    [isOnHold]          BIT           NOT NULL CONSTRAINT [DF_Invoices_Hold]     DEFAULT (0),
    [heldAt]            DATETIME2(7)  NULL,
    [createdAt]         DATETIME2(7)  NOT NULL CONSTRAINT [DF_Invoices_Created]  DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Invoices]         PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Invoices_Code]    UNIQUE ([invoiceCode]),
    CONSTRAINT [FK_Invoice_Staff]     FOREIGN KEY ([staffId])    REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [FK_Invoice_Counter]   FOREIGN KEY ([counterId])  REFERENCES [dbo].[Counters]([id]),
    CONSTRAINT [FK_Invoice_Schedule]  FOREIGN KEY ([scheduleId]) REFERENCES [dbo].[WorkSchedules]([id]),
    CONSTRAINT [FK_Invoice_Customer]  FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customers]([id]),
    CONSTRAINT [FK_Invoice_Promotion] FOREIGN KEY ([promotionId]) REFERENCES [dbo].[Promotions]([id]),
    CONSTRAINT [CK_Invoice_Status]    CHECK ([status] IN ('UNPAID', 'PAID', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
    CONSTRAINT [CK_Invoice_Amounts]   CHECK ([totalAmount] >= 0 AND [finalAmount] >= 0 AND [promotionDiscount] >= 0 AND [voucherDiscount] >= 0 AND [pointDiscount] >= 0 AND [usedPoints] >= 0),
    CONSTRAINT [CK_Invoice_MaxDiscount] CHECK (([promotionDiscount] + [voucherDiscount] + [pointDiscount]) <= [totalAmount] * 0.5),
    CONSTRAINT [CK_Invoice_Hold]      CHECK ([isOnHold] = 0 OR [status] = 'UNPAID')
);
GO
CREATE NONCLUSTERED INDEX [IX_Invoices_CreatedAt] ON [dbo].[Invoices]([createdAt] DESC, [id] DESC);
CREATE NONCLUSTERED INDEX [IX_Invoices_Customer]  ON [dbo].[Invoices]([customerId]);
CREATE NONCLUSTERED INDEX [IX_Invoices_Schedule]  ON [dbo].[Invoices]([scheduleId], [status]);
CREATE NONCLUSTERED INDEX [IX_Invoices_Status]    ON [dbo].[Invoices]([status], [createdAt] DESC);
GO

-- [OLD+] InvoiceItems. productUnitId -> variantId. batchId = batch deducted (FEFO, BR-56).
--        If FEFO has to take one product from two batches, insert one InvoiceItems row per batch.
--        unitPrice / unitName / productName are snapshots, so later price edits do not change history.
--        quantity is DECIMAL(15,3) (legacy INT) so weight items such as 0.5 kg fit; keep whole numbers
--        for PIECE variants in the app.
CREATE TABLE [dbo].[InvoiceItems] (
    [id]           BIGINT IDENTITY(1,1) NOT NULL,
    [invoiceId]    BIGINT        NOT NULL,
    [productId]    BIGINT        NOT NULL,
    [variantId]    INT           NOT NULL,
    [batchId]      BIGINT        NULL,
    [productName]  NVARCHAR(255) NOT NULL,
    [unitName]     NVARCHAR(20)  NOT NULL,
    [unitPrice]    DECIMAL(15,2) NOT NULL,
    [quantity]     DECIMAL(15,3) NOT NULL,
    [lineTotal]    DECIMAL(15,2) NOT NULL,
    [baseQuantity] DECIMAL(15,3) NOT NULL,
    CONSTRAINT [PK_InvoiceItems] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_InvItem_Invoice] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoices]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_InvItem_Product] FOREIGN KEY ([productId]) REFERENCES [dbo].[Products]([id]),
    CONSTRAINT [FK_InvItem_Variant] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [FK_InvItem_Batch]   FOREIGN KEY ([batchId])   REFERENCES [dbo].[Batches]([id]),
    CONSTRAINT [CK_InvItem_Amounts] CHECK ([unitPrice] >= 0 AND [quantity] > 0 AND [lineTotal] >= 0 AND [baseQuantity] > 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_InvItem_Invoice] ON [dbo].[InvoiceItems]([invoiceId]);
CREATE NONCLUSTERED INDEX [IX_InvItem_Variant] ON [dbo].[InvoiceItems]([variantId]);
GO

-- [OLD+] Payments. Methods: CASH or BANK_TRANSFER (VietQR / Sepay); QR_VNPAY removed (SRS has no VNPay).
--        receivedAmount / changeAmount = BR-27, BR-28 (cash only).
CREATE TABLE [dbo].[Payments] (
    [id]             BIGINT IDENTITY(1,1) NOT NULL,
    [invoiceId]      BIGINT        NOT NULL,
    [paymentMethod]  VARCHAR(20)   NOT NULL,
    [amount]         DECIMAL(15,2) NOT NULL,
    [receivedAmount] DECIMAL(15,2) NULL,
    -- BR-28: change = received - amount, derived so it can never disagree (NULL for non-cash)
    [changeAmount]   AS (CASE WHEN [paymentMethod] = 'CASH' AND [receivedAmount] IS NOT NULL THEN [receivedAmount] - [amount] END) PERSISTED,
    [status]         VARCHAR(20)   NOT NULL,
    [createdAt]      DATETIME2(7)  NOT NULL CONSTRAINT [DF_Payment_Created] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_Payments]        PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Payment_Invoice] UNIQUE ([invoiceId]),
    CONSTRAINT [FK_Payment_Invoice] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoices]([id]) ON DELETE CASCADE,
    CONSTRAINT [CK_Payment_Method]  CHECK ([paymentMethod] IN ('CASH', 'BANK_TRANSFER')),
    CONSTRAINT [CK_Payment_Status]  CHECK ([status] IN ('PENDING', 'SUCCESS', 'FAILED')),
    CONSTRAINT [CK_Payment_Amount]  CHECK ([amount] >= 0),
    -- BR-27: a successful cash payment must record a received amount that covers the total
    CONSTRAINT [CK_Payment_Cash]    CHECK ([paymentMethod] <> 'CASH' OR [status] <> 'SUCCESS' OR ([receivedAmount] IS NOT NULL AND [receivedAmount] >= [amount]))
);
GO
CREATE NONCLUSTERED INDEX [IX_Payments_Status] ON [dbo].[Payments]([status], [createdAt] DESC);
GO

-- [REN] VnPayTransactions -> SepayTransactions (UC-10, UC-18, BR-29). Fields follow the SRS class diagram.
--       sepayId is only known once the gateway webhook arrives, so it is NULL until then; the
--       filtered unique index makes duplicate webhooks harmless (no double payment / double points).
CREATE TABLE [dbo].[SepayTransactions] (
    [id]                 BIGINT IDENTITY(1,1) NOT NULL,
    [invoiceId]          BIGINT        NOT NULL,
    [sepayId]            VARCHAR(50)   NULL,
    [transactionContent] NVARCHAR(500) NULL,
    [amountIn]           DECIMAL(15,2) NULL,
    [bankAccountNumber]  VARCHAR(50)   NULL,
    [qrUrl]              NVARCHAR(MAX) NULL,
    [expiresAt]          DATETIME2(7)  NULL,
    [status]             VARCHAR(20)   NOT NULL CONSTRAINT [DF_Sepay_Status]  DEFAULT ('PENDING'),
    [createdAt]          DATETIME2(7)  NOT NULL CONSTRAINT [DF_Sepay_Created] DEFAULT (SYSDATETIME()),
    [confirmAt]          DATETIME2(7)  NULL,
    CONSTRAINT [PK_SepayTransactions]  PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_Sepay_Invoice]      UNIQUE ([invoiceId]),
    CONSTRAINT [FK_Sepay_Invoice]      FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoices]([id]) ON DELETE CASCADE,
    CONSTRAINT [CK_Sepay_Status]       CHECK ([status] IN ('PENDING', 'SUCCESS', 'FAILED')),
    CONSTRAINT [CK_Sepay_Confirm]      CHECK ([status] <> 'SUCCESS' OR [confirmAt] IS NOT NULL)
);
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_Sepay_SepayId] ON [dbo].[SepayTransactions]([sepayId]) WHERE [sepayId] IS NOT NULL;
GO

-- [OLD+] CustomerVoucherUsage (BR-68) doubles as the Invoice <-> Voucher link: the entity diagram allows up to
--        two vouchers per invoice (Invoices.voucherId removed). customerId is NULL for walk-in buyers.
--        The 'max 2 vouchers per invoice' rule is enforced in the app.
CREATE TABLE [dbo].[CustomerVoucherUsage] (
    [id]         INT IDENTITY(1,1) NOT NULL,
    [customerId] BIGINT       NULL,
    [voucherId]  INT          NOT NULL,
    [invoiceId]  BIGINT       NOT NULL,
    [usedAt]     DATETIME2(7) NOT NULL CONSTRAINT [DF_CVU_UsedAt] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_CustomerVoucherUsage] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UQ_CVU_InvVoucher] UNIQUE ([invoiceId], [voucherId]),
    CONSTRAINT [FK_CVU_Customer] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customers]([id]),
    CONSTRAINT [FK_CVU_Voucher]  FOREIGN KEY ([voucherId])  REFERENCES [dbo].[Vouchers]([id]),
    CONSTRAINT [FK_CVU_Invoice]  FOREIGN KEY ([invoiceId])  REFERENCES [dbo].[Invoices]([id])
);
GO
CREATE NONCLUSTERED INDEX [IX_CVU_Voucher] ON [dbo].[CustomerVoucherUsage]([voucherId]);
GO

-- [OLD] CustomerPointLogs (UC-09, BR-30, BR-40). pointChange > 0 earn, < 0 redeem / reverse.
CREATE TABLE [dbo].[CustomerPointLogs] (
    [id]          BIGINT IDENTITY(1,1) NOT NULL,
    [customerId]  BIGINT        NOT NULL,
    [invoiceId]   BIGINT        NULL,
    [pointChange] INT           NOT NULL,
    [reason]      NVARCHAR(255) NULL,
    [createdAt]   DATETIME2(7)  NOT NULL CONSTRAINT [DF_CPL_Created] DEFAULT (SYSDATETIME()),
    CONSTRAINT [PK_CustomerPointLogs] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_CPL_Customer] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customers]([id]),
    CONSTRAINT [FK_CPL_Invoice]  FOREIGN KEY ([invoiceId])  REFERENCES [dbo].[Invoices]([id]),
    CONSTRAINT [CK_CPL_Change]   CHECK ([pointChange] <> 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_CPL_Customer] ON [dbo].[CustomerPointLogs]([customerId], [createdAt] DESC);
GO

-- [OLD+] Returns = refund / exchange requests (UC-03, UC-14, UC-15; BR-33..BR-40).
--        Statuses keep the legacy values Pending / Approve / Reject. refundMethod no longer allows QR_VNPAY.
--        New: exchangeInvoiceId (UC-03 POST-4), reviewNote.
CREATE TABLE [dbo].[Returns] (
    [id]                BIGINT IDENTITY(1,1) NOT NULL,
    [invoiceId]         BIGINT        NOT NULL,
    [exchangeInvoiceId] BIGINT        NULL,
    [counterId]         BIGINT        NOT NULL,
    [staffId]           BIGINT        NOT NULL,
    [returnType]        VARCHAR(20)   NOT NULL,
    [refundMethod]      VARCHAR(20)   NOT NULL,
    [totalRefundAmount] DECIMAL(15,2) NOT NULL,
    [reason]            NVARCHAR(MAX) NULL,
    [status]            VARCHAR(20)   NOT NULL CONSTRAINT [DF_Returns_Status]  DEFAULT ('Pending'),
    [createdAt]         DATETIME2(7)  NOT NULL CONSTRAINT [DF_Returns_Created] DEFAULT (SYSDATETIME()),
    [approveBy]         BIGINT        NULL,
    [approvedAt]        DATETIME2(7)  NULL,
    [reviewNote]        NVARCHAR(500) NULL,
    CONSTRAINT [PK_Returns] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_Returns_Invoice]         FOREIGN KEY ([invoiceId])         REFERENCES [dbo].[Invoices]([id]),
    CONSTRAINT [FK_Returns_ExchangeInvoice] FOREIGN KEY ([exchangeInvoiceId]) REFERENCES [dbo].[Invoices]([id]),
    CONSTRAINT [FK_Returns_Counter]         FOREIGN KEY ([counterId])         REFERENCES [dbo].[Counters]([id]),
    CONSTRAINT [FK_Returns_Staff]           FOREIGN KEY ([staffId])           REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [FK_Returns_ApproveBy]       FOREIGN KEY ([approveBy])         REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_Return_Type]     CHECK ([returnType]   IN ('REFUND', 'EXCHANGE')),
    CONSTRAINT [CK_Refund_Method]   CHECK ([refundMethod] IN ('CASH', 'BANK_TRANSFER')),
    CONSTRAINT [CK_Return_Status]   CHECK ([status] IN ('Pending', 'Approve', 'Reject')),
    CONSTRAINT [CK_Return_Amount]   CHECK ([totalRefundAmount] >= 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_Returns_Invoice] ON [dbo].[Returns]([invoiceId]);
CREATE NONCLUSTERED INDEX [IX_Returns_Status]  ON [dbo].[Returns]([status], [createdAt] DESC);
GO

-- [OLD+] ReturnItems. productUnitId -> variantId. batchId = batch to restock / flag (BR-38, BR-55).
--        restockApproved keeps the legacy values Pending / Approved / Rejected.
CREATE TABLE [dbo].[ReturnItems] (
    [id]              BIGINT IDENTITY(1,1) NOT NULL,
    [returnId]        BIGINT        NOT NULL,
    [invoiceItemId]   BIGINT        NOT NULL,
    [productId]       BIGINT        NOT NULL,
    [variantId]       INT           NULL,
    [batchId]         BIGINT        NULL,
    [productName]     NVARCHAR(250) NULL,
    [unitName]        NVARCHAR(20)  NULL,
    [quantity]        DECIMAL(15,3) NOT NULL,   -- legacy INT; decimal so 0.5 kg can be returned
    [baseQuantity]    DECIMAL(15,3) NULL,
    [refundAmount]    DECIMAL(15,2) NOT NULL,
    [restockApproved] VARCHAR(20)   NOT NULL CONSTRAINT [DF_RItem_Restock] DEFAULT ('Pending'),
    [checkedAt]       DATETIME2(7)  NULL,
    [checkedBy]       BIGINT        NULL,
    CONSTRAINT [PK_ReturnItems] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_RItem_Return]  FOREIGN KEY ([returnId])      REFERENCES [dbo].[Returns]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_RItem_InvItem] FOREIGN KEY ([invoiceItemId]) REFERENCES [dbo].[InvoiceItems]([id]),
    CONSTRAINT [FK_RItem_Product] FOREIGN KEY ([productId])     REFERENCES [dbo].[Products]([id]),
    CONSTRAINT [FK_RItem_Variant] FOREIGN KEY ([variantId])     REFERENCES [dbo].[ProductVariants]([id]),
    CONSTRAINT [FK_RItem_Batch]   FOREIGN KEY ([batchId])       REFERENCES [dbo].[Batches]([id]),
    CONSTRAINT [FK_RItem_CheckedBy] FOREIGN KEY ([checkedBy])   REFERENCES [dbo].[Staff]([id]),
    CONSTRAINT [CK_RItem_Restock] CHECK ([restockApproved] IN ('Pending', 'Approved', 'Rejected')),
    CONSTRAINT [CK_RItem_Amounts] CHECK ([quantity] > 0 AND [refundAmount] >= 0)
);
GO
CREATE NONCLUSTERED INDEX [IX_RItem_Return]  ON [dbo].[ReturnItems]([returnId]);
CREATE NONCLUSTERED INDEX [IX_RItem_InvItem] ON [dbo].[ReturnItems]([invoiceItemId]);
GO

PRINT 'RetailOnePOS schema created successfully.';
GO
